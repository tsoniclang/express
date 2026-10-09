import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Readable } from "node:stream";
import test from "node:test";
import { express, Request, Response } from "../../src/index.js";
import { createContext, MemoryResponse } from "../helpers/memory-context.js";

for (const asynchronous of [false, true]) test(`request links live through ${asynchronous ? "async" : "sync"} processing and close afterward`, async () => {
  const app = express.create();
  let request: Request | undefined;
  let response: Response | undefined;
  app.get("/", async (selectedRequest, selectedResponse) => {
    request = selectedRequest;
    response = selectedResponse;
    assert.equal(selectedRequest.res === selectedResponse, true);
    assert.equal(selectedResponse.req === selectedRequest, true);
    if (asynchronous) await Promise.resolve();
    assert.equal(selectedRequest.res === selectedResponse, true);
    selectedResponse.send("completed");
  });
  const context = createContext("GET", "/");
  await app.handle(context, app);
  assert.equal(context.response.bodyText, "completed");
  assert.equal(request !== undefined && response !== undefined, true);
  assert.equal(request?.res, undefined);
  assert.equal(response?.req, undefined);
});

for (const control of ["router", "route", "error"] as const) test(`request links close on ${control} exits`, async () => {
  const app = express.create();
  let request: Request | undefined;
  let response: Response | undefined;
  const failure = new Error("routing failure");
  app.get("/", (selectedRequest, selectedResponse, next) => {
    request = selectedRequest;
    response = selectedResponse;
    assert.equal(selectedRequest.res === selectedResponse, true);
    assert.equal(selectedResponse.req === selectedRequest, true);
    if (control === "error") throw failure;
    next(control);
  });
  const context = createContext("GET", "/");
  if (control === "error") await assert.rejects(app.handle(context, app), error => error === failure);
  else await app.handle(context, app);
  assert.equal(request !== undefined && response !== undefined, true);
  assert.equal(request?.res, undefined);
  assert.equal(response?.req, undefined);
});

test("request cleanup preserves independently replaced pair links", async () => {
  const app = express.create();
  const alternate = createContext("GET", "/alternate");
  const alternateRequest = new Request(alternate.request, app);
  const alternateResponse = new Response(alternate.response, alternateRequest);
  let request: Request | undefined;
  let response: Response | undefined;
  app.get("/", (selectedRequest, selectedResponse) => {
    request = selectedRequest;
    response = selectedResponse;
    selectedRequest.res = alternateResponse;
    selectedResponse.req = alternateRequest;
    selectedResponse.send("completed");
  });
  await app.handle(createContext("GET", "/"), app);
  assert.equal(request?.res === alternateResponse, true);
  assert.equal(response?.req === alternateRequest, true);
  alternateRequest.res = undefined;
  alternateResponse.req = undefined;
});

function deferredCompletion(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

class PendingResponse extends MemoryResponse {
  constructor(
    private readonly started: () => void,
    private readonly completion: Promise<void>,
    private readonly failure: Error | undefined,
  ) { super(); }

  override async pipeFrom(source: Readable): Promise<void> {
    this.headersSent = true;
    this.started();
    await this.completion;
    if (this.failure !== undefined) {
      await new Promise<void>(resolve => {
        source.once("close", resolve);
        source.destroy();
      });
      throw this.failure;
    }
    await super.pipeFrom(source);
  }
}

for (const scenario of ["success", "completion-error", "routing-and-completion-error"] as const) {
  test(`request lifetime waits for pending transport completion: ${scenario}`, { timeout: 30_000 }, async () => {
    const scratch = fileURLToPath(new URL("../../.temp/", import.meta.url));
    mkdirSync(scratch, { recursive: true });
    const directory = mkdtempSync(join(scratch, "request-lifetime-"));
    const file = join(directory, "body.txt");
    writeFileSync(file, "pending response");
    const started = deferredCompletion();
    const completion = deferredCompletion();
    const routingFailure = new Error("primary routing failure");
    const completionFailure = scenario === "success" ? undefined : new Error("completion failure");
    const transport = new PendingResponse(started.release, completion.promise, completionFailure);
    const app = express.create();
    let request: Request | undefined;
    let response: Response | undefined;
    const sendPendingFile = (selectedRequest: Request, selectedResponse: Response): void => {
      request = selectedRequest;
      response = selectedResponse;
      selectedResponse.sendFile("body.txt", { root: directory });
      if (scenario === "routing-and-completion-error") throw routingFailure;
    };
    if (scenario === "routing-and-completion-error") app.param("entry", sendPendingFile);
    app.get("/:entry", sendPendingFile);
    let settled = false;
    const outcome = app.handle({ ...createContext("GET", "/selected"), response: transport }, app)
      .then(() => undefined, (error: unknown) => error).finally(() => { settled = true; });
    try {
      await started.promise;
      assert.equal(settled, false, "routing must wait for the native transport");
      assert.equal(request !== undefined && response !== undefined, true);
      assert.equal(request?.res === response, true);
      assert.equal(response?.req === request, true);
      completion.release();
      assert.equal(await outcome, scenario === "routing-and-completion-error" ? routingFailure : completionFailure);
      assert.equal(request?.res, undefined);
      assert.equal(response?.req, undefined);
      if (scenario === "success") assert.equal(transport.bodyBytes?.toString(), "pending response");
    } finally {
      completion.release();
      await outcome;
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
