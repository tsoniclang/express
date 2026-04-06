import type { JsValue } from "@tsonic/core/types.js";
import test from "node:test";
import assert from "node:assert/strict";

import { express, Application, Router } from "../../src/index.js";
import { createContext } from "../helpers/memory-context.js";

test("top level factories return expected types", () => {
  assert.ok(express.create() instanceof Application);
  assert.ok(express.application() instanceof Application);
  assert.ok(express.app() instanceof Application);
});

test("json body parsing via middleware sets req body", async () => {
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

  app.post("/json", (req, res) => {
    res.json(req.body);
  });

  const context = createContext("POST", "/json", {
    bodyText: '{"ok":true}',
    headers: { "content-type": "application/json" }
  });
  await app.handle(context, app);

  assert.match(context.response.bodyText, /"ok":true/);
});

test("json middleware skips when content type is missing or mismatched", async () => {
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

  app.post("/json", (req, res) => {
    res.send(req.body == null ? "null" : "not-null");
  });

  const missingContentType = createContext("POST", "/json", {
    bodyText: '{"a":1}'
  });
  await app.handle(missingContentType, app);
  assert.equal(missingContentType.response.bodyText, "null");

  const mismatchedContentType = createContext("POST", "/json", {
    bodyText: '{"a":1}',
    headers: { "content-type": "text/plain" }
  });
  await app.handle(mismatchedContentType, app);
  assert.equal(mismatchedContentType.response.bodyText, "null");
});

test("urlencoded body parsing middleware converts form data", async () => {
  const app = express.create();

  app.use(async (req, _res, next) => {
    if (
      req.get("content-type") === "application/x-www-form-urlencoded" &&
      req.transport.bodyText
    ) {
      const body: Record<string, JsValue> = {};
      for (const pair of req.transport.bodyText.split("&")) {
        const eqIndex = pair.indexOf("=");
        if (eqIndex < 0) {
          continue;
        }
        const key = decodeURIComponent(pair.slice(0, eqIndex));
        const value = decodeURIComponent(pair.slice(eqIndex + 1));
        const existing = body[key];
        if (existing === undefined) {
          body[key] = value;
        } else if (Array.isArray(existing)) {
          body[key] = [...existing, value];
        } else {
          body[key] = [existing as string, value];
        }
      }
      req.body = body;
    }
    await next(null);
  });

  app.post("/form", (req, res) => {
    const body = req.body as Record<string, JsValue>;
    const values = body["a"] as string[];
    res.send(`${values[0]}-${values[1]}`);
  });

  const context = createContext("POST", "/form", {
    bodyText: "a=1&a=2",
    headers: { "content-type": "application/x-www-form-urlencoded" }
  });
  await app.handle(context, app);
  assert.equal(context.response.bodyText, "1-2");
});
