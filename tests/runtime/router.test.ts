import test from "node:test";
import assert from "node:assert/strict";

import { express } from "../../src/index.js";
import type { ErrorRequestHandler } from "../../src/index.js";
import { createContext } from "../helpers/memory-context.js";

test("middleware and route handlers run in order", async () => {
  const app = express.create();

  app.use(async (_req, res, next) => {
    res.set("x-mw", "on");
    await next(null);
  });

  app.get("/ping", (_req, res) => {
    res.status(200).send("pong");
  });

  const context = createContext("GET", "/ping");
  await app.handle(context, app);

  assert.equal(context.response.statusCode, 200);
  assert.equal(context.response.bodyText, "pong");
  assert.equal(context.response.getHeader("x-mw"), "on");
});

test("get slash matches only root path", async () => {
  const app = express.create();

  app.get("/", (_req, res) => {
    res.send("root");
  });

  app.get("/items/:id", (req, res) => {
    res.send(req.param("id") ?? "");
  });

  const rootContext = createContext("GET", "/");
  await app.handle(rootContext, app);
  assert.equal(rootContext.response.bodyText, "root");

  const itemContext = createContext("GET", "/items/123");
  await app.handle(itemContext, app);
  assert.equal(itemContext.response.bodyText, "123");
});

test("route params are percent-decoded before request handlers read them", async () => {
  const app = express.create();

  app.get("/users/:id", (req, res) => {
    res.send(req.param("id") ?? "");
  });

  const context = createContext("GET", "/users/user-123%40test.local");
  await app.handle(context, app);

  assert.equal(context.response.bodyText, "user-123@test.local");
});

test("next route skips remaining handlers for current route", async () => {
  const app = express.create();

  app.get("/item",
    async (_req, _res, next) => next("route"),
    (_req, res) => {
      res.send("wrong");
    });

  app.get("/item", (_req, res) => {
    res.send("ok");
  });

  const context = createContext("GET", "/item");
  await app.handle(context, app);

  assert.equal(context.response.bodyText, "ok");
});

test("app param runs once per param value in request cycle", async () => {
  const app = express.create();
  let invocations = 0;

  app.param("id", async (_req, _res, next) => {
    invocations += 1;
    await next(null);
  });

  app.get("/users/:id", async (_req, _res, next) => next(null));
  app.get("/users/:id", (_req, res) => {
    res.send("done");
  });

  const context = createContext("GET", "/users/42");
  await app.handle(context, app);

  assert.equal(context.response.bodyText, "done");
  assert.equal(invocations, 1);
});

test("app use with subapp triggers mount and routes requests", async () => {
  const app = express.create();
  const child = express.create();
  let mounted = false;

  child.on("mount", () => {
    mounted = true;
  });
  child.get("/hello", (_req, res) => {
    res.send("world");
  });

  app.use("/api", child);

  const context = createContext("GET", "/api/hello");
  await app.handle(context, app);

  assert.equal(mounted, true);
  assert.equal(context.response.bodyText, "world");
});

test("app route allows chaining http handlers", async () => {
  const app = express.create();

  app.route("/events")
    .get((_req, res) => {
      res.send("get");
    })
    .post((_req, res) => {
      res.send("post");
    });

  const getContext = createContext("GET", "/events");
  await app.handle(getContext, app);
  assert.equal(getContext.response.bodyText, "get");

  const postContext = createContext("POST", "/events");
  await app.handle(postContext, app);
  assert.equal(postContext.response.bodyText, "post");
});

test("error handler with four args is invoked after thrown error", async () => {
  const app = express.create();
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof Error) {
      res.status(500).send("handled");
    }
  };

  app.get("/boom", () => {
    throw new Error("boom");
  });
  app.useError(errorHandler);

  const context = createContext("GET", "/boom");
  await app.handle(context, app);

  assert.equal(context.response.statusCode, 500);
  assert.equal(context.response.bodyText, "handled");
});
