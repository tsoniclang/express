import test from "node:test";
import assert from "node:assert/strict";

import {
  express,
  Application,
  Request,
  Response,
  Router,
  Route,
  Params
} from "../../src/index.js";
import { createContext } from "../helpers/memory-context.js";

test("express module exposes expected top level members", () => {
  assert.equal(typeof express.create, "function");
  assert.equal(typeof express.application, "function");
  assert.equal(typeof express.app, "function");
  assert.equal(typeof express.Router, "function");
  assert.equal(typeof express.cookieParser, "function");
  assert.equal(typeof express.cors, "function");
  assert.equal(typeof express.json, "function");
  assert.equal(typeof express.raw, "function");
  assert.equal(typeof express.multipart, "function");
  assert.equal(typeof express.text, "function");
  assert.equal(typeof express.urlencoded, "function");
});

test("application exposes expected properties and methods", () => {
  const app = express.create();

  // Properties
  assert.ok("locals" in app);
  assert.ok("mountpath" in app);
  assert.ok("router" in app);

  // Methods
  assert.equal(typeof app.all, "function");
  assert.equal(typeof app.delete, "function");
  assert.equal(typeof app.disable, "function");
  assert.equal(typeof app.disabled, "function");
  assert.equal(typeof app.enable, "function");
  assert.equal(typeof app.enabled, "function");
  assert.equal(typeof app.engine, "function");
  assert.equal(typeof app.get, "function");
  assert.equal(typeof app.method, "function");
  assert.equal(typeof app.param, "function");
  assert.equal(typeof app.path, "function");
  assert.equal(typeof app.post, "function");
  assert.equal(typeof app.put, "function");
  assert.equal(typeof app.render, "function");
  assert.equal(typeof app.route, "function");
  assert.equal(typeof app.set, "function");
  assert.equal(typeof app.use, "function");
  assert.equal(typeof app.patch, "function");
  assert.equal(typeof app.handle, "function");
});

test("request exposes expected properties and methods", async () => {
  const app = express.create();

  app.get("/check", (req, res) => {
    // Properties
    assert.ok("app" in req);
    assert.ok("baseUrl" in req);
    assert.ok("body" in req);
    assert.ok("cookies" in req);
    assert.ok("file" in req);
    assert.ok("files" in req);
    assert.ok("method" in req);
    assert.ok("originalUrl" in req);
    assert.ok("params" in req);
    assert.ok("path" in req);
    assert.ok("query" in req);
    assert.ok("res" in req);
    assert.ok("route" in req);
    assert.ok("signed" in req);
    assert.ok("signedCookies" in req);

    // Methods
    assert.equal(typeof req.get, "function");
    assert.equal(typeof req.header, "function");
    assert.equal(typeof req.param, "function");

    res.send("ok");
  });

  const context = createContext("GET", "/check");
  await app.handle(context, app);
  assert.equal(context.response.bodyText, "ok");
});

test("request params is Params type", async () => {
  const app = express.create();

  app.get("/check", (req, res) => {
    assert.ok(req.params instanceof Params);
    res.send("ok");
  });

  const context = createContext("GET", "/check");
  await app.handle(context, app);
});

test("response exposes expected properties and methods", async () => {
  const app = express.create();

  app.get("/check", (_req, res) => {
    // Properties
    assert.ok("app" in res);
    assert.ok("headersSent" in res);
    assert.ok("locals" in res);
    assert.ok("req" in res);

    // Methods
    assert.equal(typeof res.append, "function");
    assert.equal(typeof res.cookie, "function");
    assert.equal(typeof res.clearCookie, "function");
    assert.equal(typeof res.end, "function");
    assert.equal(typeof res.get, "function");
    assert.equal(typeof res.json, "function");
    assert.equal(typeof res.jsonp, "function");
    assert.equal(typeof res.render, "function");
    assert.equal(typeof res.send, "function");
    assert.equal(typeof res.set, "function");
    assert.equal(typeof res.status, "function");
    assert.equal(typeof res.type, "function");
    assert.equal(typeof res.vary, "function");
    assert.equal(typeof res.header, "function");

    res.send("ok");
  });

  const context = createContext("GET", "/check");
  await app.handle(context, app);
  assert.equal(context.response.bodyText, "ok");
});

test("router exposes expected methods", () => {
  const router = new Router();

  assert.equal(typeof router.all, "function");
  assert.equal(typeof router.method, "function");
  assert.equal(typeof router.param, "function");
  assert.equal(typeof router.route, "function");
  assert.equal(typeof router.use, "function");
  assert.equal(typeof router.delete, "function");
  assert.equal(typeof router.get, "function");
  assert.equal(typeof router.post, "function");
  assert.equal(typeof router.put, "function");
  assert.equal(typeof router.patch, "function");
});

test("router supports mounting routers via use overloads", async () => {
  const app = express.create();
  const router = new Router();

  router.get("/hello", (_req, res) => res.send("mounted"));

  // Pathless use
  const appPathless = express.create();
  appPathless.use(router);
  const context1 = createContext("GET", "/hello");
  await appPathless.handle(context1, appPathless);
  assert.equal(context1.response.bodyText, "mounted");

  // use with path prefix
  app.use("/api", router);
  const context2 = createContext("GET", "/api/hello");
  await app.handle(context2, app);
  assert.equal(context2.response.bodyText, "mounted");
});

test("route exposes all get and post methods", () => {
  const app = express.create();
  const route = app.route("/test");

  assert.equal(typeof route.all, "function");
  assert.equal(typeof route.get, "function");
  assert.equal(typeof route.post, "function");
});

test("application is an instance of Router", () => {
  const app = express.create();
  assert.ok(app instanceof Router);
  assert.ok(app instanceof Application);
});
