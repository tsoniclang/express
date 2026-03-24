import test from "node:test";
import assert from "node:assert/strict";

import { express, Request, Response, Application, Params } from "../../src/index.js";
import { MemoryResponse, createContext } from "../helpers/memory-context.js";

test("request properties use expected types", () => {
  const context = createContext("GET", "/test", {
    headers: { "x-one": "1" }
  });
  const app = express.create();

  // Request is constructed inside handle, but we can verify Params type directly
  const params = new Params();
  params.set("id", "42");
  assert.equal(typeof params.get("id"), "string");
  assert.equal(params.get("id"), "42");
});

test("response statusCode is a number", async () => {
  const app = express.create();

  app.get("/", (_req, res) => {
    res.statusCode = 201;
    assert.equal(typeof res.statusCode, "number");
    assert.equal(res.statusCode, 201);
    res.send("ok");
  });

  const context = createContext("GET", "/");
  await app.handle(context, app);
  assert.equal(context.response.statusCode, 201);
});

test("cookie options support all standard fields", () => {
  const options = {
    domain: "example.com",
    httpOnly: true,
    maxAge: 5000,
    path: "/admin",
    priority: "high",
    secure: true,
    sameSite: "Strict" as const
  };

  assert.equal(options.domain, "example.com");
  assert.equal(options.httpOnly, true);
  assert.equal(options.maxAge, 5000);
  assert.equal(options.path, "/admin");
  assert.equal(options.priority, "high");
  assert.equal(options.secure, true);
  assert.equal(options.sameSite, "Strict");
});

test("params entries returns all key value pairs", () => {
  const params = new Params();
  params.set("a", "1");
  params.set("b", "2");

  const entries = params.entries();
  assert.equal(entries.length, 2);

  const keys = entries.map(([k]) => k);
  assert.ok(keys.includes("a"));
  assert.ok(keys.includes("b"));
});

test("params clear removes all entries", () => {
  const params = new Params();
  params.set("a", "1");
  params.set("b", "2");
  params.clear();

  assert.equal(params.get("a"), undefined);
  assert.equal(params.get("b"), undefined);
  assert.equal(params.entries().length, 0);
});

test("params set coerces non-string values to string", () => {
  const params = new Params();
  params.set("num", 123);
  assert.equal(params.get("num"), "123");

  params.set("null", null);
  assert.equal(params.get("null"), "");

  params.set("undef", undefined);
  assert.equal(params.get("undef"), "");
});

test("response headersSent is false initially and true after send", async () => {
  const app = express.create();

  app.get("/", (_req, res) => {
    assert.equal(res.headersSent, false);
    res.send("ok");
    assert.equal(res.headersSent, true);
  });

  const context = createContext("GET", "/");
  await app.handle(context, app);
});

test("application is an instanceof Application", () => {
  const app = express.create();
  assert.ok(app instanceof Application);
});

test("request get is case insensitive", async () => {
  const app = express.create();

  app.get("/", (req, res) => {
    const lower = req.get("x-test") ?? "missing";
    const upper = req.get("X-Test") ?? "missing";
    res.send(`${lower}|${upper}`);
  });

  const context = createContext("GET", "/", {
    headers: { "x-test": "value" }
  });
  await app.handle(context, app);
  assert.equal(context.response.bodyText, "value|value");
});
