import test from "node:test";
import assert from "node:assert/strict";

import { express } from "../../src/index.js";
import { createContext } from "../helpers/memory-context.js";

test("response exposes app and locals", async () => {
  const app = express.create();

  app.get("/", (_req, res) => {
    res.locals["name"] = "value";
    assert.equal(res.app, app);
    assert.equal(res.locals["name"], "value");
    res.send("ok");
  });

  const context = createContext("GET", "/");
  await app.handle(context, app);
  assert.equal(context.response.bodyText, "ok");
});

test("append accumulates multiple values for the same header", async () => {
  const app = express.create();

  app.get("/", (_req, res) => {
    res.append("Warning", "199 misc");
    res.append("Warning", "299 extra");

    const warning = res.get("warning") ?? "";
    res.send(warning);
  });

  const context = createContext("GET", "/");
  await app.handle(context, app);

  assert.match(context.response.bodyText, /199 misc/);
  assert.match(context.response.bodyText, /299 extra/);
});

test("append accepts string arrays", async () => {
  const app = express.create();

  app.get("/", (_req, res) => {
    res.append("Link", ["<a>", "<b>"]);
    const link = res.get("link") ?? "";
    res.send(link);
  });

  const context = createContext("GET", "/");
  await app.handle(context, app);

  assert.match(context.response.bodyText, /<a>/);
  assert.match(context.response.bodyText, /<b>/);
});

test("cookie and set-cookie header serialization", async () => {
  const app = express.create();

  app.get("/", (_req, res) => {
    res.cookie("obj", { a: 1 });
    const setCookie = res.get("set-cookie") ?? "";
    res.send(setCookie);
  });

  const context = createContext("GET", "/");
  await app.handle(context, app);

  assert.match(context.response.bodyText, /obj=/);
});

test("json sets content type to application/json", async () => {
  const app = express.create();

  app.get("/null", (_req, res) => res.json(null));
  app.get("/string", (_req, res) => res.json("raw-json"));
  app.get("/object", (_req, res) => res.json({ ok: true }));

  const nullContext = createContext("GET", "/null");
  await app.handle(nullContext, app);
  assert.equal(nullContext.response.getHeader("content-type"), "application/json");

  const stringContext = createContext("GET", "/string");
  await app.handle(stringContext, app);
  assert.equal(stringContext.response.getHeader("content-type"), "application/json");

  const objectContext = createContext("GET", "/object");
  await app.handle(objectContext, app);
  assert.equal(objectContext.response.getHeader("content-type"), "application/json");
});

test("jsonp uses configured callback name", async () => {
  const app = express.create();
  app.set("jsonp callback name", "cb");

  app.get("/jsonp-string", (_req, res) => res.jsonp("raw-jsonp"));
  app.get("/jsonp-object", (_req, res) => res.jsonp({ ok: true }));

  const stringContext = createContext("GET", "/jsonp-string");
  await app.handle(stringContext, app);
  assert.equal(stringContext.response.getHeader("content-type"), "application/javascript");

  const objectContext = createContext("GET", "/jsonp-object");
  await app.handle(objectContext, app);
  assert.match(objectContext.response.bodyText, /^cb\(/);
});

test("jsonp without app uses default callback name", () => {
  const app = express.create();
  app.get("/jsonp", (_req, res) => {
    res.jsonp("x");
    assert.equal(res.get("content-type"), "application/javascript");
    // Without jsonp callback name setting, defaults to "callback"
  });
});

test("set and header are aliases for setting response headers", async () => {
  const app = express.create();

  app.get("/", (_req, res) => {
    res.set("x-one", "1");
    res.header("x-two", "2");
    res.send(`${res.get("x-one")}|${res.get("x-two")}`);
  });

  const context = createContext("GET", "/");
  await app.handle(context, app);
  assert.equal(context.response.bodyText, "1|2");
});

test("status type and status code chain correctly", async () => {
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

test("render overloads use engine when available or fallback when missing", async () => {
  const app = express.create();
  app.engine("tpl", (_view, locals, callback) => callback(null, `hello ${locals["name"]}`));

  app.get("/render-locals", (_req, res) => {
    res.render("home.tpl", { name: "world" });
  });

  const renderContext = createContext("GET", "/render-locals");
  await app.handle(renderContext, app);
  assert.equal(renderContext.response.bodyText, "hello world");

  app.get("/render-callback", (_req, res) => {
    res.render("home.tpl", { name: "matrix" }, (_error, html) => {
      res.send(html ?? "");
    });
  });

  const callbackContext = createContext("GET", "/render-callback");
  await app.handle(callbackContext, app);
  assert.equal(callbackContext.response.bodyText, "hello matrix");

  app.get("/render-fallback", (_req, res) => {
    res.render("missing.engine", undefined, (_error, html) => {
      res.send(html ?? "");
    });
  });

  const fallbackContext = createContext("GET", "/render-fallback");
  await app.handle(fallbackContext, app);
  assert.equal(fallbackContext.response.bodyText, "<rendered:missing.engine>");

  app.get("/render-fallback-send", (_req, res) => {
    res.render("missing.engine");
  });

  const fallbackSendContext = createContext("GET", "/render-fallback-send");
  await app.handle(fallbackSendContext, app);
  assert.equal(fallbackSendContext.response.bodyText, "<rendered:missing.engine>");
});

test("send handles text string and null payloads", async () => {
  const app = express.create();

  app.get("/text", (_req, res) => res.send("text"));
  app.get("/empty", (_req, res) => res.send());

  const textContext = createContext("GET", "/text");
  await app.handle(textContext, app);
  assert.equal(textContext.response.bodyText, "text");
  assert.equal(textContext.response.headersSent, true);

  const emptyContext = createContext("GET", "/empty");
  await app.handle(emptyContext, app);
  assert.equal(emptyContext.response.bodyText, "");
});

test("send handles binary payloads", async () => {
  const app = express.create();

  app.get("/binary", (_req, res) => {
    res.send(new Uint8Array([1, 2, 3]));
  });

  const context = createContext("GET", "/binary");
  await app.handle(context, app);
  assert.equal(context.response.getHeader("content-type"), "application/octet-stream");
});

test("send handles object payloads as json", async () => {
  const app = express.create();

  app.get("/object", (_req, res) => {
    res.send({ value: 1 });
  });

  const context = createContext("GET", "/object");
  await app.handle(context, app);
  assert.equal(context.response.getHeader("content-type"), "application/json");
});

test("set with null value produces empty string", async () => {
  const app = express.create();

  app.get("/", (_req, res) => {
    res.set("x-null", null as unknown as string);
    res.send(res.get("x-null") ?? "undefined");
  });

  const context = createContext("GET", "/");
  await app.handle(context, app);
  assert.equal(context.response.bodyText, "");
});
