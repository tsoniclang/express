import { asinterface } from "@tsonic/core/lang.js";
import test from "node:test";
import assert from "node:assert/strict";

import { express } from "../../src/index.js";
import type { ErrorRequestHandler } from "../../src/index.js";
import { Router } from "../../src/index.js";
import { createContext } from "../helpers/memory-context.js";

async function assertRoute(
  app: ReturnType<typeof express.create>,
  method: string,
  path: string,
  expectedBody: string,
  expectedStatus: number = 200
): Promise<void> {
  const context = createContext(method, path);
  await app.handle(context, app);
  assert.equal(context.response.statusCode, expectedStatus);
  assert.equal(context.response.bodyText, expectedBody);
}

test("app get post put delete patch all register and handle requests", async () => {
  const app = express.create();

  app.get("/get", (_req, res) => res.send("get"));
  app.post("/post", (_req, res) => res.send("post"));
  app.put("/put", (_req, res) => res.send("put"));
  app.delete("/delete", (_req, res) => res.send("delete"));
  app.patch("/patch", (_req, res) => res.send("patch"));
  app.all("/all", (_req, res) => res.send("all"));

  await assertRoute(app, "GET", "/get", "get");
  await assertRoute(app, "POST", "/post", "post");
  await assertRoute(app, "PUT", "/put", "put");
  await assertRoute(app, "DELETE", "/delete", "delete");
  await assertRoute(app, "PATCH", "/patch", "patch");
  await assertRoute(app, "GET", "/all", "all");
  await assertRoute(app, "POST", "/all", "all");
});

test("router registers and handles requests when mounted on app", async () => {
  const app = express.create();
  const router = new Router();

  router.get("/hello", (_req, res) => res.send("ok-router"));

  app.use("/r", router);
  await assertRoute(app, "GET", "/r/hello", "ok-router");
});

test("route convenience overloads chain and execute", async () => {
  const app = express.create();

  app.route("/chain/all").all((_req, res) => res.send("all"));
  app.route("/chain/get").get((_req, res) => res.send("get"));
  app.route("/chain/post").post((_req, res) => res.send("post"));

  await assertRoute(app, "GET", "/chain/all", "all");
  await assertRoute(app, "GET", "/chain/get", "get");
  await assertRoute(app, "POST", "/chain/post", "post");
});

test("method fallback handles arbitrary verbs", async () => {
  const app = express.create();
  app.method("REPORT", "/m", (_req, res) => res.send("app"));
  await assertRoute(app, "REPORT", "/m", "app");

  const viaRouter = express.create();
  const router = new Router();
  router.method("LOCK", "/x", (_req, res) => res.send("router"));
  viaRouter.use("/api", router);
  await assertRoute(viaRouter, "LOCK", "/api/x", "router");
});

test("routing path matching covers regex and arrays", async () => {
  const app = express.create();

  app.get(/^\/rx\/[0-9]+$/, (_req, res) => res.send("regex"));
  app.get(["/array-a", "/array-b"], (_req, res) => res.send("array"));

  await assertRoute(app, "GET", "/rx/42", "regex");
  await assertRoute(app, "GET", "/array-a", "array");
  await assertRoute(app, "GET", "/array-b", "array");
});

test("splat middleware and param routes work together", async () => {
  const app = express.create();

  app.use("/api/{*splat}", async (_req, res, next) => {
    res.set("x-splat", "on");
    await next(null);
  });

  app.get("/api/:id", (req, res) => {
    const id = req.param("id") ?? "";
    res.send(id);
  });

  const context = createContext("GET", "/api/77");
  await app.handle(context, app);
  assert.equal(context.response.bodyText, "77");
  assert.equal(context.response.getHeader("x-splat"), "on");
});

test("middleware prefix matching works", async () => {
  const app = express.create();

  app.use("/prefix", async (_req, res, next) => {
    res.set("x-prefix", "1");
    await next(null);
  });

  app.get("/prefix/test", (_req, res) => res.send("prefix"));

  const context = createContext("GET", "/prefix/test");
  await app.handle(context, app);
  assert.equal(context.response.bodyText, "prefix");
  assert.equal(context.response.getHeader("x-prefix"), "1");
});

test("next route skips remaining handlers for current route", async () => {
  const app = express.create();

  app.get(
    "/next-route",
    async (_req, _res, next) => next("route"),
    (_req, res) => res.send("wrong")
  );
  app.get("/next-route", (_req, res) => res.send("right"));

  await assertRoute(app, "GET", "/next-route", "right");
});

test("error handling catches thrown errors and invokes error handler", async () => {
  const app = express.create();

  app.get("/boom", () => {
    throw new Error("boom");
  });

  const errorHandler: ErrorRequestHandler = (_error, _req, res, _next) => {
    res.status(500).send("handled");
  };
  app.useError(errorHandler);

  await assertRoute(app, "GET", "/boom", "handled", 500);
});

test("param callbacks fire once per unique param value", async () => {
  const app = express.create();
  let count = 0;

  app.param("id", async (_req, _res, next) => {
    count += 1;
    await next(null);
  });

  app.get("/users/:id", async (_req, _res, next) => next(null));
  app.get("/users/:id", (_req, res) => res.send("done"));

  await assertRoute(app, "GET", "/users/42", "done");
  assert.equal(count, 1);
});

test("router use with mounted application routes correctly", async () => {
  const app = express.create();
  const router = new Router();
  const child = express.create();

  child.get("/child", (_req, res) => res.send("child-app"));
  router.use("/mount", child);
  app.use(router);

  await assertRoute(app, "GET", "/mount/child", "child-app");
});

test("null route path matches all requests", async () => {
  const app = express.create();
  app.method("GET", asinterface<string>(null), (_req, res) => res.send("null-path"));
  await assertRoute(app, "GET", "/anywhere", "null-path");
});

test("normalize path handles empty and missing slash specs", async () => {
  const rootApp = express.create();
  rootApp.get("", (_req, res) => res.send("root"));
  await assertRoute(rootApp, "GET", "/", "root");

  const noSlashApp = express.create();
  noSlashApp.get("noslash", (_req, res) => res.send("noslash"));
  await assertRoute(noSlashApp, "GET", "/noslash", "noslash");
});

test("router export preserves layers and combines mount paths", () => {
  const router = new Router();
  router.get("/child", (_req, res) => res.send("child"));
  router.get("/", (_req, res) => res.send("root"));

  const combined = router.export("/api");
  assert.ok(combined.length > 0);
});
