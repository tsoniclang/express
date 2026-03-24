import test from "node:test";
import assert from "node:assert/strict";

import { express, Request, Response } from "../../src/index.js";
import { createContext } from "../helpers/memory-context.js";

// NOTE: The CLR version tests bundled middleware (cookieParser, cors, multipart)
// which are not yet implemented in the native package. These tests verify the
// equivalent behavior using the primitives available in the native runtime.

test("response cookie sets set-cookie header with path option", async () => {
  const app = express.create();
  app.get("/set", (_req, res) => {
    res.cookie("sid", "abc", { path: "/" });
    res.send("ok");
  });

  const context = createContext("GET", "/set");
  await app.handle(context, app);

  const header = context.response.getHeader("set-cookie") ?? "";
  assert.match(header, /sid=abc/);
  assert.match(header, /Path=\//);
});

test("response cookie serializes object values as json", async () => {
  const app = express.create();
  app.get("/obj", (_req, res) => {
    res.cookie("data", { a: 1 });
    res.send("ok");
  });

  const context = createContext("GET", "/obj");
  await app.handle(context, app);

  const header = context.response.getHeader("set-cookie") ?? "";
  assert.match(header, /data=/);
});

test("response cookie includes domain and maxage options", async () => {
  const app = express.create();
  app.get("/opts", (_req, res) => {
    res.cookie("sid", "abc", {
      domain: "example.com",
      maxAge: 30000,
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      priority: "high"
    });
    res.send("ok");
  });

  const context = createContext("GET", "/opts");
  await app.handle(context, app);

  const header = context.response.getHeader("set-cookie") ?? "";
  assert.match(header, /Domain=example\.com/);
  assert.match(header, /HttpOnly/);
  assert.match(header, /Secure/);
  assert.match(header, /SameSite=Strict/);
  assert.match(header, /Priority=high/);
});

test("cookieParser moves valid signed cookies to signedCookies", async () => {
  const secret = "shh";
  const app = express.create();
  app.use(express.cookieParser(secret));
  app.get("/signed", (req, res) => {
    const signed = req.signedCookies.get("sid") ?? "missing";
    const cookie = req.cookies.get("sid") ?? "missing";
    res.json({ signed, cookie });
  });

  const signer = express.create();
  signer.use(express.cookieParser(secret));
  signer.get("/issue", (_req, res) => {
    res.cookie("sid", "abc", { signed: true });
    res.send("ok");
  });
  const issueContext = createContext("GET", "/issue");
  await signer.handle(issueContext, signer);
  const signedHeader = issueContext.response.getHeader("set-cookie");
  assert.ok(signedHeader);

  const context = createContext("GET", "/signed", {
    headers: { cookie: signedHeader }
  });
  await app.handle(context, app);

  assert.match(context.response.bodyText, /"signed":"abc"/);
  assert.match(context.response.bodyText, /"cookie":"missing"/);
});

test("response cookie signs when cookieParser secret is installed", async () => {
  const app = express.create();
  app.use(express.cookieParser("shh"));
  app.get("/set", (_req, res) => {
    res.cookie("sid", "abc", { signed: true }).send("ok");
  });

  const context = createContext("GET", "/set");
  await app.handle(context, app);

  const header = context.response.getHeader("set-cookie") ?? "";
  assert.match(header, /sid=s:abc\./);
});

test("response cookie throws when signing without secret", async () => {
  const app = express.create();
  let message = "";

  app.get("/set", (_req, res) => {
    try {
      res.cookie("sid", "abc", { signed: true });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    res.send("done");
  });

  const context = createContext("GET", "/set");
  await app.handle(context, app);

  assert.match(message, /Cannot set signed cookie without a secret/);
});

test("cors sets allow origin for simple requests and skips when origin missing", async () => {
  const app = express.create();
  app.use(express.cors());
  app.get("/x", (_req, res) => {
    res.send("ok");
  });

  const missingOrigin = createContext("GET", "/x");
  await app.handle(missingOrigin, app);
  assert.equal(
    missingOrigin.response.getHeader("access-control-allow-origin"),
    undefined
  );

  const withOrigin = createContext("GET", "/x", {
    headers: { origin: "https://example.com" }
  });
  await app.handle(withOrigin, app);
  assert.equal(
    withOrigin.response.getHeader("access-control-allow-origin"),
    "*"
  );
});

test("cors handles preflight and respects preflightContinue", async () => {
  const app = express.create();
  app.use(express.cors());
  app.method("OPTIONS", "/x", (_req, res) => {
    res.send("should-not-run");
  });

  const preflight = createContext("OPTIONS", "/x", {
    headers: {
      origin: "https://example.com",
      "access-control-request-method": "POST"
    }
  });
  await app.handle(preflight, app);
  assert.equal(preflight.response.statusCode, 204);
  assert.equal(
    preflight.response.getHeader("access-control-allow-methods"),
    "POST"
  );

  const withContinue = express.create();
  withContinue.use(express.cors({ preflightContinue: true }));
  withContinue.method("OPTIONS", "/x", (_req, res) => {
    res.send("ran");
  });

  const continued = createContext("OPTIONS", "/x", {
    headers: {
      origin: "https://example.com",
      "access-control-request-method": "POST"
    }
  });
  await withContinue.handle(continued, withContinue);
  assert.equal(continued.response.bodyText, "ran");
});

test("json text raw and urlencoded middleware parse request bodies", async () => {
  const app = express.create();
  app.post("/json", express.json(), (req, res) => {
    res.json(req.body);
  });
  app.post("/text", express.text(), (req, res) => {
    res.send(req.body as string);
  });
  app.post("/raw", express.raw(), (req, res) => {
    const body = req.body as Uint8Array;
    res.send(String(body.length));
  });
  app.post("/form", express.urlencoded(), (req, res) => {
    const body = req.body as Record<string, unknown>;
    const value = body["name"];
    res.send(Array.isArray(value) ? value.join("|") : String(value));
  });

  const jsonContext = createContext("POST", "/json", {
    headers: { "content-type": "application/json" },
    bodyText: '{"ok":true}'
  });
  await app.handle(jsonContext, app);
  assert.match(jsonContext.response.bodyText, /"ok":true/);

  const textContext = createContext("POST", "/text", {
    headers: { "content-type": "text/plain" },
    bodyText: "hello"
  });
  await app.handle(textContext, app);
  assert.equal(textContext.response.bodyText, "hello");

  const rawContext = createContext("POST", "/raw", {
    headers: { "content-type": "application/octet-stream" },
    bodyBytes: new Uint8Array([1, 2, 3, 4])
  });
  await app.handle(rawContext, app);
  assert.equal(rawContext.response.bodyText, "4");

  const formContext = createContext("POST", "/form", {
    headers: { "content-type": "application/x-www-form-urlencoded" },
    bodyText: "name=tsonic&name=lang"
  });
  await app.handle(formContext, app);
  assert.equal(formContext.response.bodyText, "tsonic|lang");
});

test("multipart parses fields and files for single upload", async () => {
  const app = express.create();
  const upload = express.multipart();
  app.use(upload.single("avatar"));
  app.post("/upload", (req, res) => {
    const body = req.body as Record<string, unknown> | undefined;
    res.json({
      title: body?.["title"],
      file: req.file?.originalname,
      count: req.files.get("avatar")?.length ?? 0
    });
  });

  const boundary = "----tsonic-test";
  const multipartBody =
    `--${boundary}\r\n` +
    "Content-Disposition: form-data; name=\"title\"\r\n\r\n" +
    "hello\r\n" +
    `--${boundary}\r\n` +
    "Content-Disposition: form-data; name=\"avatar\"; filename=\"a.txt\"\r\n" +
    "Content-Type: text/plain\r\n\r\n" +
    "file\r\n" +
    `--${boundary}--\r\n`;

  const context = createContext("POST", "/upload", {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    bodyBytes: new Uint8Array(Buffer.from(multipartBody, "utf-8"))
  });
  await app.handle(context, app);

  assert.match(context.response.bodyText, /"title":"hello"/);
  assert.match(context.response.bodyText, /"file":"a.txt"/);
  assert.match(context.response.bodyText, /"count":1/);
});

test("multipart single throws for unexpected file field", async () => {
  const boundary = "x";
  const multipartBody =
    `--${boundary}\r\n` +
    "Content-Disposition: form-data; name=\"other\"; filename=\"a.txt\"\r\n" +
    "Content-Type: text/plain\r\n\r\n" +
    "file\r\n" +
    `--${boundary}--\r\n`;

  const app = express.create();
  const context = createContext("POST", "/upload", {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    bodyBytes: new Uint8Array(Buffer.from(multipartBody, "utf-8"))
  });
  const req = new Request(context.request, app);
  const res = new Response(context.response, req);

  await assert.rejects(
    async () => {
      await express.multipart().single("avatar")(req, res, async () => undefined);
    },
    /Unexpected multipart field/
  );
});

test("multipart none rejects files", async () => {
  const boundary = "none";
  const multipartBody =
    `--${boundary}\r\n` +
    "Content-Disposition: form-data; name=\"avatar\"; filename=\"a.txt\"\r\n" +
    "Content-Type: text/plain\r\n\r\n" +
    "file\r\n" +
    `--${boundary}--\r\n`;

  const app = express.create();
  const context = createContext("POST", "/upload", {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    bodyBytes: new Uint8Array(Buffer.from(multipartBody, "utf-8"))
  });
  const req = new Request(context.request, app);
  const res = new Response(context.response, req);

  await assert.rejects(
    async () => {
      await express.multipart().none()(req, res, async () => undefined);
    },
    /Expected no files/
  );
});
