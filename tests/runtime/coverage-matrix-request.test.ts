import test from "node:test";
import assert from "node:assert/strict";

import { express, Request, Params } from "../../src/index.js";
import { createContext } from "../helpers/memory-context.js";

test("request created from transport populates core properties", async () => {
  const app = express.create();

  app.get("/users/:id", (req, res) => {
    res.json({
      method: req.method,
      path: req.path,
      paramId: req.param("id")
    });
  });

  const context = createContext("GET", "/users/42", {
    query: { a: ["1", "2"], b: "3" },
    headers: { "x-requested-with": "XMLHttpRequest" }
  });
  await app.handle(context, app);

  assert.match(context.response.bodyText, /"method":"GET"/);
  assert.match(context.response.bodyText, /"paramId":"42"/);
});

test("get and header read from internal headers", async () => {
  const app = express.create();

  app.get("/", (req, res) => {
    const val = req.get("x-one") ?? "missing";
    res.send(val);
  });

  const context = createContext("GET", "/", {
    headers: { "x-one": "1" }
  });
  await app.handle(context, app);

  assert.equal(context.response.bodyText, "1");
});

test("header is an alias for get", async () => {
  const app = express.create();

  app.get("/", (req, res) => {
    const val = req.header("x-test") ?? "missing";
    res.send(val);
  });

  const context = createContext("GET", "/", {
    headers: { "x-test": "value" }
  });
  await app.handle(context, app);

  assert.equal(context.response.bodyText, "value");
});

test("get returns undefined for missing header", async () => {
  const app = express.create();

  app.get("/", (req, res) => {
    const val = req.get("missing");
    res.send(val ?? "undefined");
  });

  const context = createContext("GET", "/");
  await app.handle(context, app);

  assert.equal(context.response.bodyText, "undefined");
});

test("param reads from params dictionary and coerces to string", () => {
  const params = new Params();
  params.set("id", "42");
  assert.equal(params.get("id"), "42");
  assert.equal(params.get("missing"), undefined);

  params.set("n", 123);
  assert.equal(params.get("n"), "123");
});

test("query parameters are available on request", async () => {
  const app = express.create();

  app.get("/search", (req, res) => {
    const q = req.query["q"] ?? "none";
    res.send(String(q));
  });

  const context = createContext("GET", "/search", {
    query: { q: "hello" }
  });
  await app.handle(context, app);

  assert.equal(context.response.bodyText, "hello");
});
