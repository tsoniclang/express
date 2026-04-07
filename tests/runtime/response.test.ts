import test from "node:test";
import assert from "node:assert/strict";

import { express } from "../../src/index.js";
import { createContext } from "../helpers/memory-context.js";

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
    callback(null, `hello ${String(locals["name"])}`);
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
  app.get("/jsonp", (_req, res) => {
    res.jsonp({ ok: true });
  });

  const context = createContext("GET", "/jsonp");
  await app.handle(context, app);

  assert.match(context.response.bodyText, /^cb\(/);
});
