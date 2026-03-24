import test from "node:test";
import assert from "node:assert/strict";

import { express } from "../../src/index.js";
import { createContext } from "../helpers/memory-context.js";

test("app router property returns self and setting helpers round trip values", () => {
  const app = express.create();
  assert.equal(app.router, app);
  assert.equal(app.disabled("trust proxy"), false);
  assert.equal(app.enabled("trust proxy"), false);

  app.disable("trust proxy");
  assert.equal(app.disabled("trust proxy"), true);
  assert.equal(app.enabled("trust proxy"), false);

  app.enable("trust proxy");
  assert.equal(app.enabled("trust proxy"), true);
  assert.equal(app.disabled("trust proxy"), false);

  app.set("trust proxy", "not-bool");
  assert.equal(app.enabled("trust proxy"), false);

  app.set("title", "matrix");
  assert.equal(app.get("title"), "matrix");
});

test("app path covers string array and fallback variants", () => {
  const app = express.create();

  app.mountpath = "/admin";
  assert.equal(app.path(), "/admin");

  app.mountpath = ["/a", "/b"];
  assert.equal(app.path(), "/a,/b");
});

test("app param array and engine render overloads work", async () => {
  const app = express.create();
  const seen = new Set<string>();

  app.param(["id", "page"], async (_req, _res, next, _value, name) => {
    seen.add(name);
    await next(null);
  });

  app.get("/users/:id/:page", (_req, res) => {
    res.send("ok");
  });

  const context = createContext("GET", "/users/42/3");
  await app.handle(context, app);
  assert.equal(context.response.bodyText, "ok");
  assert.equal(seen.has("id"), true);
  assert.equal(seen.has("page"), true);

  app.engine(".tpl", (_view, locals, callback) => callback(null, `name=${locals["name"]}`));

  let renderedWithLocals: string | undefined;
  app.render("welcome.tpl", { name: "sam" }, (_error, html) => {
    renderedWithLocals = html;
  });
  assert.equal(renderedWithLocals, "name=sam");

  let fallback: string | undefined;
  app.render("missing.view", (_error, html) => {
    fallback = html;
  });
  assert.equal(fallback, "<rendered:missing.view>");

  let fallbackWithLocals: string | undefined;
  app.render("missing.view", { name: "extra" }, (_error, html) => {
    fallbackWithLocals = html;
  });
  assert.equal(fallbackWithLocals, "<rendered:missing.view>");

  let trailingDot: string | undefined;
  app.render("index.", (_error, html) => {
    trailingDot = html;
  });
  assert.equal(trailingDot, "<rendered:index.>");
});

test("app use mounts child apps and emits mount event", async () => {
  const app = express.create();
  const childA = express.create();
  const childB = express.create();
  let mountedA = false;
  let mountedB = false;

  childA.on("mount", () => {
    mountedA = true;
  });
  childB.on("mount", () => {
    mountedB = true;
  });

  childA.get("/a", (_req, res) => {
    res.send("A");
  });
  childB.get("/b", (_req, res) => {
    res.send("B");
  });

  app.use("/api", childA, childB);

  assert.equal(mountedA, true);
  assert.equal(mountedB, true);
  assert.equal(childA.mountpath, "/api");
  assert.equal(childB.mountpath, "/api");

  const contextA = createContext("GET", "/api/a");
  await app.handle(contextA, app);
  assert.equal(contextA.response.bodyText, "A");

  const contextB = createContext("GET", "/api/b");
  await app.handle(contextB, app);
  assert.equal(contextB.response.bodyText, "B");

  const childC = express.create();
  const childD = express.create();
  app.use(childC, childD);
  assert.equal(childC.mountpath, "/");
  assert.equal(childD.mountpath, "/");
});
