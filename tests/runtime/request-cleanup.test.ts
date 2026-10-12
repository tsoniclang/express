import assert from "node:assert/strict";
import test from "node:test";
import { express } from "../../src/index.js";
import { createContext } from "../helpers/memory-context.js";

test("request cleanup attempts every resource and preserves the first rejection", async () => {
  const app = express.create();
  app.get("/", (_request, response) => response.send("complete"));
  const context = createContext("GET", "/");
  const first = new Error("first cleanup");
  const calls: number[] = [];
  context.request.cleanup.push(
    async () => { calls.push(1); throw first; },
    async () => { calls.push(2); throw new Error("second cleanup"); },
    async () => { calls.push(3); }
  );
  await assert.rejects(app.handle(context, app), error => error === first);
  assert.deepEqual(calls, [1, 2, 3]);
  assert.equal(context.response.bodyText, "complete");
});

test("successful request cleanup neither drops resources nor invents a rejection", async () => {
  const app = express.create();
  app.get("/", (_request, response) => response.send("complete"));
  const context = createContext("GET", "/");
  const calls: number[] = [];
  context.request.cleanup.push(async () => { calls.push(1); }, async () => { calls.push(2); });
  await app.handle(context, app);
  assert.deepEqual(calls, [1, 2]);
});
