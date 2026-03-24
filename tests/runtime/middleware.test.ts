import test from "node:test";
import assert from "node:assert/strict";

import { express } from "../../src/index.js";
import { createContext } from "../helpers/memory-context.js";

test("json middleware parses json payload", async () => {
  const app = express.create();

  app.use(async (req, _res, next) => {
    if (
      req.get("content-type") === "application/json" &&
      req.transport.bodyText
    ) {
      req.body = JSON.parse(req.transport.bodyText);
    }
    await next(null);
  });

  app.post("/json", (req, res) => res.json(req.body));

  const context = createContext("POST", "/json", {
    bodyText: '{"a":1}',
    headers: { "content-type": "application/json" }
  });
  await app.handle(context, app);

  assert.equal(context.response.getHeader("content-type"), "application/json");
  assert.match(context.response.bodyText, /"a":1/);
});

test("text middleware parses text payload", async () => {
  const app = express.create();

  app.use(async (req, _res, next) => {
    if (
      req.get("content-type") === "text/plain" &&
      req.transport.bodyText
    ) {
      req.body = req.transport.bodyText;
    }
    await next(null);
  });

  app.post("/text", (req, res) => res.send(req.body as string));

  const context = createContext("POST", "/text", {
    bodyText: "hello",
    headers: { "content-type": "text/plain" }
  });
  await app.handle(context, app);

  assert.equal(context.response.bodyText, "hello");
});

test("raw middleware parses binary payload", async () => {
  const app = express.create();

  app.use(async (req, _res, next) => {
    if (
      req.get("content-type") === "application/octet-stream" &&
      req.transport.bodyBytes
    ) {
      req.body = req.transport.bodyBytes;
    }
    await next(null);
  });

  app.post("/raw", (req, res) => {
    const bytes = req.body as Uint8Array;
    res.send(String(bytes.length));
  });

  const context = createContext("POST", "/raw", {
    bodyBytes: new Uint8Array([1, 2, 3, 4]),
    headers: { "content-type": "application/octet-stream" }
  });
  await app.handle(context, app);

  assert.equal(context.response.bodyText, "4");
});

test("urlencoded middleware parses form payload", async () => {
  const app = express.create();

  app.use(async (req, _res, next) => {
    if (
      req.get("content-type") === "application/x-www-form-urlencoded" &&
      req.transport.bodyText
    ) {
      const body: Record<string, unknown> = {};
      for (const pair of req.transport.bodyText.split("&")) {
        const eqIndex = pair.indexOf("=");
        if (eqIndex < 0) {
          continue;
        }
        const key = decodeURIComponent(pair.slice(0, eqIndex));
        const value = decodeURIComponent(pair.slice(eqIndex + 1));
        body[key] = value;
      }
      req.body = body;
    }
    await next(null);
  });

  app.post("/form", (req, res) => {
    const body = req.body as Record<string, unknown>;
    res.send(body["name"] as string);
  });

  const context = createContext("POST", "/form", {
    bodyText: "name=tsonic",
    headers: { "content-type": "application/x-www-form-urlencoded" }
  });
  await app.handle(context, app);

  assert.equal(context.response.bodyText, "tsonic");
});

test("response cookie sets set-cookie header", async () => {
  const app = express.create();

  app.get("/cookie", (_req, res) => {
    res.cookie("session", "abc", { path: "/" }).send("ok");
  });

  const context = createContext("GET", "/cookie");
  await app.handle(context, app);

  assert.match(context.response.getHeader("set-cookie") ?? "", /session=abc/);
});

test("response render uses registered engine", async () => {
  const app = express.create();
  app.engine("tpl", (_view, locals, callback) => {
    callback(null, `hello ${locals["name"]}`);
  });

  app.get("/view", (_req, res) => {
    res.render("home.tpl", { name: "world" });
  });

  const context = createContext("GET", "/view");
  await app.handle(context, app);

  assert.equal(context.response.bodyText, "hello world");
});

test("response jsonp uses configured callback name", async () => {
  const app = express.create();
  app.set("jsonp callback name", "cb");
  app.get("/jsonp", (_req, res) => res.jsonp({ ok: true }));

  const context = createContext("GET", "/jsonp");
  await app.handle(context, app);

  assert.match(context.response.bodyText, /^cb\(/);
});
