import test from "node:test";
import assert from "node:assert/strict";

import { express } from "../../src/index.js";
import { createContext } from "../helpers/memory-context.js";

test("enable disable and set get roundtrip settings", () => {
  const app = express.create();

  app.disable("trust proxy");
  assert.equal(app.disabled("trust proxy"), true);
  assert.equal(app.enabled("trust proxy"), false);

  app.enable("trust proxy");
  assert.equal(app.enabled("trust proxy"), true);
  assert.equal(app.disabled("trust proxy"), false);

  app.set("title", "my-site");
  assert.equal(app.get("title"), "my-site");
});

test("app path reflects mountpath", () => {
  const app = express.create();
  app.mountpath = "/admin";
  assert.equal(app.path(), "/admin");

  app.mountpath = ["/a", "/b"];
  assert.equal(app.path(), "/a,/b");
});

test("app param array registers multiple handlers", async () => {
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
});

test("app render uses registered engine callback", () => {
  const app = express.create();
  app.engine("tpl", (_view, locals, callback) => callback(null, `name=${locals["name"]}`));

  let rendered: string | undefined;
  app.render("welcome.tpl", { name: "alex" }, (_error, html) => {
    rendered = html;
  });

  assert.equal(rendered, "name=alex");
});

test("app all matches all http methods", async () => {
  const app = express.create();
  app.all("/health", (_req, res) => {
    res.send("ok");
  });

  const getContext = createContext("GET", "/health");
  await app.handle(getContext, app);
  assert.equal(getContext.response.bodyText, "ok");

  const postContext = createContext("POST", "/health");
  await app.handle(postContext, app);
  assert.equal(postContext.response.bodyText, "ok");
});
