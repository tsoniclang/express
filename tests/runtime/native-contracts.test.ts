import assert from "node:assert/strict";
import test from "node:test";
import { express } from "../../src/index.js";
import { createContext } from "../helpers/memory-context.js";

test("nested closed path arrays preserve their authored alternatives", async () => {
  const app = express.create();
  app.get(["/first", ["/second", /^\/third$/]], (_req, response) => response.send("matched"));
  for (const path of ["/first", "/second", "/third"]) {
    const context = createContext("GET", path);
    await app.handle(context, app);
    assert.equal(context.response.bodyText, "matched");
  }
});

test("closed handler completions retain synchronous and asynchronous response returns", async () => {
  const app = express.create();
  app.get("/sync", (_req, response) => response.send("sync"));
  app.get("/async", async (_req, response) => response.send("async"));
  app.get("/void", (_req, response) => { response.send("void"); });
  for (const path of ["sync", "async", "void"]) {
    const context = createContext("GET", `/${path}`);
    await app.handle(context, app);
    assert.equal(context.response.bodyText, path);
  }
});

test("closed response JSON preserves scalar, array and record values", async () => {
  const app = express.create();
  app.get("/record", (_req, response) => response.json({ empty: null, zero: 0, present: true }));
  app.get("/array", (_req, response) => response.json(["quoted\"", 0, false, null]));
  app.get("/cycle", (_req, response) => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    assert.throws(() => response.json(circular), TypeError);
    response.send("rejected");
  });
  for (const [path, expected] of [
    ["record", '{"empty":null,"zero":0,"present":true}'],
    ["array", '["quoted\\\"",0,false,null]'],
    ["cycle", "rejected"],
  ]) {
    const context = createContext("GET", `/${path}`);
    await app.handle(context, app);
    assert.equal(context.response.bodyText, expected);
  }
});
