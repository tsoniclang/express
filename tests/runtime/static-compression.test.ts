import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync, gzipSync, gunzipSync } from "node:zlib";

import { express } from "../../src/index.js";
import type { ErrorRequestHandler } from "../../src/index.js";
import { createContext } from "../helpers/memory-context.js";

test("static files stream, support ranges and validators, and remain rooted", async () => {
  const root = mkdtempSync(join(tmpdir(), "express-static-"));
  const outside = mkdtempSync(join(tmpdir(), "express-outside-"));
  try {
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "docs", "index.html"), "hello static");
    writeFileSync(join(root, "file.txt"), "0123456789");
    writeFileSync(join(root, ".secret"), "hidden");
    writeFileSync(join(outside, "secret.txt"), "outside secret");
    symlinkSync(join(outside, "secret.txt"), join(root, "escape.txt"));
    const app = express.create();
    app.use(express.static(root, { fallthrough: false }));

    const file = createContext("GET", "/file.txt");
    await app.handle(file, app);
    assert.equal(file.response.bodyBytes?.toString(), "0123456789");
    assert.equal(file.response.getHeader("content-length"), "10");
    const etag = file.response.getHeader("etag");
    assert.ok(etag);

    const range = createContext("GET", "/file.txt", { headers: { range: "bytes=2-4" } });
    await app.handle(range, app);
    assert.equal(range.response.statusCode, 206);
    assert.equal(range.response.bodyBytes?.toString(), "234");
    assert.equal(range.response.getHeader("content-range"), "bytes 2-4/10");

    const unchanged = createContext("GET", "/file.txt", { headers: { "if-none-match": etag } });
    await app.handle(unchanged, app);
    assert.equal(unchanged.response.statusCode, 304);

    const index = createContext("GET", "/docs/");
    await app.handle(index, app);
    assert.equal(index.response.bodyBytes?.toString(), "hello static");

    const redirect = createContext("GET", "/docs");
    await app.handle(redirect, app);
    assert.equal(redirect.response.statusCode, 301);
    assert.equal(redirect.response.getHeader("location"), "/docs/");

    const hidden = createContext("GET", "/.secret");
    await app.handle(hidden, app);
    assert.equal(hidden.response.statusCode, 404);

    const traversal = createContext("GET", "/%2e%2e/%2e%2e/etc/passwd");
    await app.handle(traversal, app);
    assert.equal(traversal.response.statusCode, 403);
    const escape = createContext("GET", "/escape.txt");
    await app.handle(escape, app);
    assert.equal(escape.response.statusCode, 403);
    assert.doesNotMatch(escape.response.bodyText, /outside secret/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("compression streams eligible bodies and leaves small or binary bodies native", async () => {
  const app = express.create();
  app.use(express.compression());
  app.get("/large", (_req, res) => res.send("a".repeat(8192)));
  app.get("/small", (_req, res) => res.send("small"));
  app.get("/binary", (_req, res) => res.send(Buffer.alloc(8192, 1)));

  const gzip = createContext("GET", "/large", { headers: { "accept-encoding": "gzip" } });
  await app.handle(gzip, app);
  assert.equal(gzip.response.getHeader("content-encoding"), "gzip");
  assert.equal(gunzipSync(gzip.response.bodyBytes!).toString(), "a".repeat(8192));
  assert.equal(gzip.response.getHeader("vary"), "Accept-Encoding");

  const brotli = createContext("GET", "/large", { headers: { "accept-encoding": "br" } });
  await app.handle(brotli, app);
  assert.equal(brotli.response.getHeader("content-encoding"), "br");
  assert.equal(brotliDecompressSync(brotli.response.bodyBytes!).toString(), "a".repeat(8192));

  const small = createContext("GET", "/small", { headers: { "accept-encoding": "gzip" } });
  await app.handle(small, app);
  assert.equal(small.response.bodyText, "small");
  assert.equal(small.response.getHeader("content-encoding"), undefined);

  const binary = createContext("GET", "/binary", { headers: { "accept-encoding": "gzip" } });
  await app.handle(binary, app);
  assert.equal(binary.response.bodyBytes?.length, 8192);
  assert.equal(binary.response.getHeader("content-encoding"), undefined);
});

test("request inflation enforces limits on decompressed output", async () => {
  const app = express.create();
  app.post("/text", express.text({ limit: 1024 }), (req, res) => res.send(req.body as string));
  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    res.status(413).send(error instanceof Error ? error.message : "failed");
  };
  app.useError(onError);

  const valid = createContext("POST", "/text", {
    headers: { "content-type": "text/plain", "content-encoding": "gzip" },
    bodyBytes: gzipSync("hello")
  });
  await app.handle(valid, app);
  assert.equal(valid.response.bodyText, "hello");

  const bomb = createContext("POST", "/text", {
    headers: { "content-type": "text/plain", "content-encoding": "gzip" },
    bodyBytes: gzipSync("x".repeat(16384))
  });
  await app.handle(bomb, app);
  assert.equal(bomb.response.statusCode, 413);
  assert.match(bomb.response.bodyText, /too large/);
});
