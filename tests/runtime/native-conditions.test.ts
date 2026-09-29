import assert from "node:assert/strict";
import test from "node:test";
import { Request, Response } from "../../src/index.js";
import { createCorsMiddleware } from "../../src/runtime/middleware/cors.js";
import { createContext } from "../helpers/memory-context.js";

test("native presence checks preserve missing and empty header behavior", () => {
  const cases: Record<string, string>[] = [{}, {
    cookie: "", host: "", "x-forwarded-proto": "", "x-forwarded-for": "", "content-type": "", range: "",
  }];
  for (const headers of cases) {
    const context = createContext("GET", "/", { headers });
    const request = new Request(context.request);
    assert.equal(request.protocol, "http");
    assert.equal(request.hostname, "");
    assert.equal(request.ip, "");
    assert.deepEqual(request.ips, []);
    assert.deepEqual(request.subdomains, []);
    assert.equal(request.is("json"), false);
    assert.equal(request.range(100), -2);
  }
});

test("empty response headers retain type and Vary defaults", () => {
  const context = createContext("GET", "/");
  const response = new Response(context.response);
  response.set("Vary", "");
  response.vary("Origin");
  assert.equal(response.get("Vary"), "Origin");
  response.set("Content-Type", "");
  response.send("hello");
  assert.equal(response.get("Content-Type"), "text/html; charset=utf-8");
  assert.equal(context.response.bodyText, "hello");
});

test("optional CORS booleans distinguish enabled from missing or false", async () => {
  for (const credentials of [undefined, false, true]) {
    const context = createContext("GET", "/", { headers: { origin: "https://example.test" } });
    const request = new Request(context.request);
    const response = new Response(context.response, request);
    let calls = 0;
    await createCorsMiddleware({ credentials })(request, response, () => { calls++; });
    assert.equal(response.get("Access-Control-Allow-Origin"), credentials === true ? "https://example.test" : "*");
    assert.equal(response.get("Access-Control-Allow-Credentials"), credentials === true ? "true" : undefined);
    assert.equal(calls, 1);
  }
  for (const origin of [undefined, "", "   "]) {
    const context = createContext("GET", "/", { headers: origin === undefined ? {} : { origin } });
    const request = new Request(context.request);
    const response = new Response(context.response, request);
    let calls = 0;
    await createCorsMiddleware()(request, response, () => { calls++; });
    assert.equal(response.get("Access-Control-Allow-Origin"), undefined);
    assert.equal(calls, 1);
  }
});
