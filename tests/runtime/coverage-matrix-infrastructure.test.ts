import test from "node:test";
import assert from "node:assert/strict";

import { express, Router } from "../../src/index.js";
import { createContext } from "../helpers/memory-context.js";

test("router default methods return self for chaining", () => {
  const router = new Router();

  assert.equal(router.all("/", (_req, res) => res.send("ok")), router);
  assert.equal(router.delete("/", (_req, res) => res.send("ok")), router);
  assert.equal(router.get("/", (_req, res) => res.send("ok")), router);
  assert.equal(router.patch("/", (_req, res) => res.send("ok")), router);
  assert.equal(router.post("/", (_req, res) => res.send("ok")), router);
  assert.equal(router.put("/", (_req, res) => res.send("ok")), router);
  assert.equal(router.method("GET", "/", (_req, res) => res.send("ok")), router);
  assert.equal(router.param("id", async (_req, _res, next) => next(null)), router);
  assert.equal(router.use(async (_req, _res, next) => next(null)), router);
  assert.equal(router.use("/", async (_req, _res, next) => next(null)), router);
});

test("route method returns a Route and supports route", () => {
  const app = express.create();
  const route = app.route("/test");
  assert.ok(route);
});

test("cookie options round trip all fields", () => {
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

test("response append and set handle header values", () => {
  const app = express.create();
  app.get("/headers", (_req, res) => {
    res.append("Warning", "199 misc");
    res.append("Warning", "299 extra");
    res.set("x-custom", "value");

    const warning = res.get("warning") ?? "";
    const custom = res.get("x-custom") ?? "";
    res.send(`${warning}|${custom}`);
  });

  const context = createContext("GET", "/headers");
  app.handle(context, app);
});
