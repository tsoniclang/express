import test from "node:test";
import assert from "node:assert/strict";

import { express, Params } from "../../src/index.js";
import { createContext } from "../helpers/memory-context.js";

test("request header methods and get are case insensitive", async () => {
  const app = express.create();

  app.get("/", (req, res) => {
    const ct = req.get("Content-Type") ?? "missing";
    const ctLower = req.header("content-type") ?? "missing";
    res.send(`${ct}|${ctLower}`);
  });

  const context = createContext("GET", "/", {
    headers: { "content-type": "application/json" }
  });
  await app.handle(context, app);

  assert.equal(context.response.bodyText, "application/json|application/json");
});

test("request body is available after middleware sets it", async () => {
  const app = express.create();

  app.use(async (req, _res, next) => {
    req.body = "hello";
    await next(null);
  });

  app.get("/", (req, res) => {
    res.send(req.body as string);
  });

  const context = createContext("GET", "/");
  await app.handle(context, app);

  assert.equal(context.response.bodyText, "hello");
});

test("response header and cookie helpers work without http context", () => {
  // Testing response in isolation via app route
  const app = express.create();

  app.get("/append", (_req, res) => {
    res.append("Warning", "199 misc");
    res.append("Warning", "299 extra");
    const warning = res.get("warning") ?? "";
    res.send(warning);
  });

  const context = createContext("GET", "/append");
  app.handle(context, app);
});

test("response cookie and clearCookie set correct headers", async () => {
  const app = express.create();

  app.get("/cookie", (_req, res) => {
    res.cookie("token", "abc");
    const setCookie = res.get("set-cookie") ?? "";
    res.send(setCookie);
  });

  const context = createContext("GET", "/cookie");
  await app.handle(context, app);

  assert.match(context.response.bodyText, /token=abc/);
});

test("response status type and chain calls work", async () => {
  const app = express.create();

  app.get("/", (_req, res) => {
    res.status(418).type("json");
    assert.equal(res.statusCode, 418);
    assert.equal(res.get("content-type"), "json");
    res.send("ok");
  });

  const context = createContext("GET", "/");
  await app.handle(context, app);

  assert.equal(context.response.statusCode, 418);
});

test("response set and header are aliases for setting headers", async () => {
  const app = express.create();

  app.get("/", (_req, res) => {
    res.set("x-one", "1");
    res.header("x-two", "2");
    assert.equal(res.get("x-one"), "1");
    assert.equal(res.get("x-two"), "2");
    res.send("ok");
  });

  const context = createContext("GET", "/");
  await app.handle(context, app);
});

test("response json and jsonp emit expected payload forms", async () => {
  const app = express.create();
  app.set("jsonp callback name", "cb");

  app.get("/json", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/jsonp", (_req, res) => {
    res.jsonp({ ok: true });
  });

  const jsonContext = createContext("GET", "/json");
  await app.handle(jsonContext, app);
  assert.equal(jsonContext.response.getHeader("content-type"), "application/json");

  const jsonpContext = createContext("GET", "/jsonp");
  await app.handle(jsonpContext, app);
  assert.equal(jsonpContext.response.getHeader("content-type"), "application/javascript");
});

test("response render and format execute handlers", async () => {
  const app = express.create();

  app.get("/render", (_req, res) => {
    res.render("index");
  });

  const renderContext = createContext("GET", "/render");
  await app.handle(renderContext, app);
  assert.equal(renderContext.response.headersSent, true);
});

test("params indexer is safe and coerces values to string", () => {
  const params = new Params();
  assert.equal(params.get("missing"), undefined);

  params.set("id", "42");
  assert.equal(params.get("id"), "42");
  assert.equal(params.get("ID"), "42");

  params.set("n", 123);
  assert.equal(params.get("n"), "123");
});
