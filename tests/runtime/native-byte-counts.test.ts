import assert from "node:assert/strict";
import { existsSync, type ReadStream } from "node:fs";
import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import test from "node:test";
import { express, Request } from "../../src/index.js";
import { collectBounded, readBoundedBody } from "../../src/runtime/middleware/bounded-body.js";
import { readBodyBytes } from "../../src/runtime/middleware/body-parsers.js";
import { parseMultipartStream } from "../../src/runtime/middleware/multipart-parser.js";
import { createContext } from "../helpers/memory-context.js";

function assertDetached(source: Readable): void {
  for (const event of ["data", "end", "error", "close"]) {
    assert.equal(source.listenerCount(event), 0, `${event} listener retained`);
  }
}

test("bounded collection preserves empty and exact multi-chunk binary bodies", async () => {
  for (const chunks of [[], [Buffer.from([0, 128, 255]), Buffer.from([10, 13, 0])]]) {
    const expected = Buffer.concat(chunks);
    const source = Readable.from(chunks);
    assert.deepEqual(await collectBounded(source, expected.length), expected);
    assertDetached(source);
  }
});

test("bounded collection rejects before retaining an over-limit chunk and detaches", async () => {
  const source = Readable.from([Buffer.from([1, 2]), Buffer.from([3, 4])]);
  await assert.rejects(collectBounded(source, 3), /request entity too large/);
  assert.equal(source.destroyed, true);
  assertDetached(source);
});

test("bounded collection preserves the original stream failure and detaches", async () => {
  const failure = new Error("source failure");
  const source = Readable.from((async function* () {
    yield Buffer.from([1, 2]);
    throw failure;
  })());
  await assert.rejects(collectBounded(source, 2), (error: unknown) => error === failure);
  assertDetached(source);
});

test("bounded collection rejects a premature close without treating it as completion", async () => {
  const source = new Readable({
    read() {
      this.push(Buffer.from([1, 2]));
      this.destroy();
    },
  });
  await assert.rejects(collectBounded(source, 2), /closed before completion/);
  assertDetached(source);
});

test("body limits reject nonfinite, fractional and negative inputs before consuming", async () => {
  const app = express.create();
  for (const limit of [NaN, Infinity, -Infinity, -1, 0.5]) {
    const source = Readable.from([Buffer.from("unused")]);
    const req = new Request(createContext("POST", "/", { body: source }).request, app);
    await assert.rejects(readBoundedBody(req, limit), /Invalid body size limit/);
    assert.equal(source.readableFlowing, null);
    assertDetached(source);
    source.destroy();
  }
});

test("body limit units and byte counting remain exact for multibyte text", async () => {
  const app = express.create();
  const exact = new Request(createContext("POST", "/", { bodyText: "é" }).request, app);
  assert.deepEqual(await readBodyBytes(exact, "0.001953125kb"), Buffer.from("é"));
  const exceeded = new Request(createContext("POST", "/", { bodyText: "é" }).request, app);
  await assert.rejects(readBodyBytes(exceeded, 1), /request entity too large/);
  const empty = new Request(createContext("POST", "/").request, app);
  assert.equal((await readBodyBytes(empty, 0)).length, 0);
});

test("multipart file limits retain native integer validation without a 53-bit cap", () => {
  for (const limit of [NaN, Infinity, -Infinity, -1, 0.5]) {
    assert.throws(() => express.multipart({ maxFileSizeBytes: limit }), /Invalid multipart file size limit/);
    assert.throws(() => express.multipart({ maxFileCount: limit }), /Invalid multipart file count limit/);
  }
  assert.doesNotThrow(() => express.multipart({ maxFileSizeBytes: 2 ** 53 + 2 }));
});

test("multipart streamed file size, binary bytes, backpressure and cleanup remain intact", async () => {
  const app = express.create();
  const boundary = "native-byte-count-boundary";
  const fileBytes = Buffer.alloc(256 * 1024);
  for (let index = 0; index < fileBytes.length; index += 1) fileBytes[index] = index % 256;
  const payload = [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\né\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="binary.dat"\r\n\r\n`),
    fileBytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];
  const source = Readable.from(payload, { highWaterMark: 1 });
  let paused = 0;
  source.on("pause", () => { paused += 1; });
  const context = createContext("POST", "/", { body: source });
  const request = new Request(context.request, app);
  const paths: string[] = [];
  try {
    const parsed = await parseMultipartStream(request, boundary, { mode: "any", maxFileSizeBytes: fileBytes.length });
    assert.equal(parsed.body?.title, "é");
    assert.equal(parsed.files.length, 1);
    const file = parsed.files[0]!;
    assert.equal(file.size, fileBytes.length);
    assert.deepEqual(await file.buffer(), fileBytes);
    const stream = file.stream() as ReadStream;
    const path = String(stream.path);
    paths.push(path);
    stream.destroy();
    assert.equal(existsSync(path), true);
    assert.ok(paused > 0);
    assertDetached(source);
  } finally {
    for (const cleanup of context.request.cleanup) await cleanup();
  }
  for (const path of paths) assert.equal(existsSync(path), false);
});

test("multipart fields retain byte limits and repeated values across split boundaries", async () => {
  const app = express.create();
  const boundary = "split-boundary";
  const payload = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\né\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\n\r\n` +
    `--${boundary}--\r\n`,
  );
  const chunks: Buffer[] = [];
  for (let index = 0; index < payload.length; index += 1) chunks.push(payload.subarray(index, index + 1));
  const context = createContext("POST", "/", { body: Readable.from(chunks) });
  const parsed = await parseMultipartStream(new Request(context.request, app), boundary, { mode: "none" });
  assert.deepEqual(parsed.body?.title, ["é", ""]);
  assert.equal(parsed.files.length, 0);
  assert.equal(context.request.cleanup.length, 0);
  const oversized = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="field"\r\n\r\n${"é".repeat(32 * 1024 + 1)}\r\n--${boundary}--\r\n`,
  );
  const exceeded = createContext("POST", "/", { body: Readable.from([oversized]) });
  await assert.rejects(
    parseMultipartStream(new Request(exceeded.request, app), boundary, { mode: "none" }),
    /Multipart part exceeds its size limit/,
  );
  assert.equal(exceeded.request.body.destroyed, true);
});

test("router absence controls preserve both successful and failed async completions", async () => {
  const app = express.create();
  const failure = new Error("exact failure");
  app.get("/null", (_req, _res, next) => next(null));
  app.get("/undefined", (_req, _res, next) => next(undefined));
  app.get("/failure", async () => { throw failure; });
  app.use((_req, response) => response.send("present"));
  app.useError((error, _req, response) => {
    assert.equal(error, failure);
    return response.send("failed");
  });
  for (const path of ["/null", "/undefined", "/failure"]) {
    const context = createContext("GET", path);
    await app.handle(context, app);
    assert.equal(context.response.bodyText, path === "/failure" ? "failed" : "present");
  }
});

test("multipart empty and nonempty closing suffixes accept every transport split", async () => {
  const app = express.create();
  const boundary = "closing-boundary";
  for (const opening of [
    `--${boundary}`,
    `--${boundary}\r\nContent-Disposition: form-data; name="field"\r\n\r\nvalue\r\n--${boundary}`,
  ]) {
    for (const suffix of ["--", "--\r\n"]) {
      const bytes = Buffer.from(opening + suffix);
      for (let split = 1; split < bytes.length; split += 1) {
        const context = createContext("POST", "/", {
          body: Readable.from([bytes.subarray(0, split), bytes.subarray(split)]),
        });
        const parsed = await parseMultipartStream(new Request(context.request, app), boundary, { mode: "none" });
        assert.equal(parsed.files.length, 0);
        assert.equal(parsed.body?.field, opening.includes("name=") ? "value" : undefined);
      }
    }
  }
});

test("multipart closing suffixes reject incomplete and extra bytes", async () => {
  const app = express.create();
  const boundary = "closing-boundary";
  for (const suffix of ["\r", "\n", "\rX", "\r\nX", "epilogue"]) {
    const context = createContext("POST", "/", {
      body: Readable.from([Buffer.from(`--${boundary}--`), Buffer.from(suffix)]),
    });
    await assert.rejects(
      parseMultipartStream(new Request(context.request, app), boundary, { mode: "none" }),
      /closing boundary|epilogue/,
    );
    assert.equal(context.request.body.destroyed, true);
  }
});
