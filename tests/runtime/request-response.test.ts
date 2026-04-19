import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { express, Params } from "../../src/index.js";
import { createContext } from "../helpers/memory-context.js";

test("request header methods and get are case insensitive", async () => {
  const app = express.create();

  app.get("/", (req, res) => {
    const ct = req.get("Content-Type") ?? "missing";
    const ctLower = req.header("content-type") ?? "missing";
    res.send(`${ct}|${ctLower}`);
  });

  const context = createContext("GET", "/", {
    headers: { "content-type": "application/json" }
  });
  await app.handle(context, app);

  assert.equal(context.response.bodyText, "application/json|application/json");
});

test("request body is available after middleware sets it", async () => {
  const app = express.create();

  app.use(async (req, _res, next) => {
    req.body = "hello";
    await next(null);
  });

  app.get("/", (req, res) => {
    res.send(req.body as string);
  });

  const context = createContext("GET", "/");
  await app.handle(context, app);

  assert.equal(context.response.bodyText, "hello");
});

test("response header and cookie helpers work without http context", () => {
  // Testing response in isolation via app route
  const app = express.create();

  app.get("/append", (_req, res) => {
    res.append("Warning", "199 misc");
    res.append("Warning", "299 extra");
    const warning = res.get("warning") ?? "";
    res.send(warning);
  });

  const context = createContext("GET", "/append");
  app.handle(context, app);
});

test("response cookie and clearCookie set correct headers", async () => {
  const app = express.create();

  app.get("/cookie", (_req, res) => {
    res.cookie("token", "abc");
    const setCookie = res.get("set-cookie") ?? "";
    res.send(setCookie);
  });

  const context = createContext("GET", "/cookie");
  await app.handle(context, app);

  assert.match(context.response.bodyText, /token=abc/);
});

test("response status type and chain calls work", async () => {
  const app = express.create();

  app.get("/", (_req, res) => {
    res.status(418).type("json");
    assert.equal(res.statusCode, 418);
    assert.equal(res.get("content-type"), "json");
    res.send("ok");
  });

  const context = createContext("GET", "/");
  await app.handle(context, app);

  assert.equal(context.response.statusCode, 418);
});

test("response set and header are aliases for setting headers", async () => {
  const app = express.create();

  app.get("/", (_req, res) => {
    res.set("x-one", "1");
    res.header("x-two", "2");
    assert.equal(res.get("x-one"), "1");
    assert.equal(res.get("x-two"), "2");
    res.send("ok");
  });

  const context = createContext("GET", "/");
  await app.handle(context, app);
});

test("response json and jsonp emit expected payload forms", async () => {
  const app = express.create();
  app.set("jsonp callback name", "cb");

  app.get("/json", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/jsonp", (_req, res) => {
    res.jsonp({ ok: true });
  });

  const jsonContext = createContext("GET", "/json");
  await app.handle(jsonContext, app);
  assert.equal(jsonContext.response.getHeader("content-type"), "application/json");

  const jsonpContext = createContext("GET", "/jsonp");
  await app.handle(jsonpContext, app);
  assert.equal(jsonpContext.response.getHeader("content-type"), "application/javascript");
});

test("response render and format execute handlers", async () => {
  const app = express.create();

  app.get("/render", (_req, res) => {
    res.render("index");
  });

  const renderContext = createContext("GET", "/render");
  await app.handle(renderContext, app);
  assert.equal(renderContext.response.headersSent, true);
});

test("request helpers negotiate accepts content and ranges", async () => {
  const app = express.create();
  app.set("subdomain offset", 2);

  app.get("/", (req, res) => {
    assert.equal(req.host, "example.com:3000");
    assert.equal(req.protocol, "https");
    assert.equal(req.hostname, "example.com");
    assert.equal(req.ip, "203.0.113.10");
    assert.deepEqual(req.ips, ["203.0.113.10", "198.51.100.7"]);
    assert.equal(req.xhr, true);
    assert.equal(req.secure, true);
    assert.equal(req.fresh, false);
    assert.equal(req.stale, true);
    assert.equal(req.accepts(["json", "html"]), "html");
    assert.equal(req.acceptsCharsets("utf-8"), "utf-8");
    assert.equal(req.acceptsEncodings(["gzip", "br"]), "br");
    assert.equal(req.acceptsLanguages(["en", "fr"]), "fr");
    assert.equal(req.is(["application/json", "text/plain"]), "application/json");
    req.setHeader("x-extra", "1");
    assert.equal(req.get("x-extra"), "1");

    req.setHeader("x-forwarded-host", "tobi.ferrets.example.com:3000");
    assert.deepEqual(req.subdomains, ["ferrets", "tobi"]);

    const range = req.range(20, { combine: true });
    assert.notEqual(range, -1);
    assert.notEqual(range, -2);
    if (typeof range !== "number") {
      assert.equal(range.type, "bytes");
      assert.deepEqual(
        range.ranges.map((entry: { start: number; end: number }) => ({
          start: entry.start,
          end: entry.end
        })),
        [
          { start: 0, end: 9 },
          { start: 15, end: 19 }
        ]
      );
    }

    res.send("ok");
  });

  const context = createContext("GET", "/", {
    headers: {
      accept: "text/html;q=0.9, application/json;q=0.5",
      "accept-charset": "utf-8, iso-8859-1;q=0.7",
      "accept-encoding": "br, gzip;q=0.8",
      "accept-language": "fr-CA, en;q=0.8",
      "content-type": "application/json; charset=utf-8",
      host: "example.com:3000",
      range: "bytes=0-4,5-9,15-"
    }
  });
  context.request.headers!["x-forwarded-proto"] = "https";
  context.request.headers!["x-forwarded-for"] = "203.0.113.10, 198.51.100.7";
  context.request.headers!["x-requested-with"] = "XMLHttpRequest";
  await app.handle(context, app);

  assert.equal(context.response.bodyText, "ok");
});

test("response redirect, links, format, sendFile, and download helpers work", async () => {
  const root = mkdtempSync(join(tmpdir(), "express-response-"));
  try {
    const filePath = join(root, "hello.txt");
    writeFileSync(filePath, "hello file");

    const app = express.create();

    app.get("/redirect", (_req, res) => {
      res.redirect(301, "/target");
    });

    app.get("/links", (_req, res) => {
      res.links({ next: "/page/2", last: "/page/10" }).send("ok");
    });

    app.get("/format", (req, res) => {
      res.format({
        "text/plain": (_request, response) => {
          response.send(`plain:${req.accepts(["text/plain", "application/json"])}`);
        },
        "application/json": (_request, response) => {
          response.json({ ok: true });
        }
      });
    });

    app.get("/status", (_req, res) => {
      res.contentType("text/plain");
      res.set({ "x-one": "1", "x-two": "2" });
      res.sendStatus(204);
    });

    app.get("/send-file", (_req, res) => {
      res.sendFile("hello.txt", { root });
    });

    app.get("/download", (_req, res) => {
      res.download("hello.txt", "report.txt", { root });
    });

    const redirectContext = createContext("GET", "/redirect");
    await app.handle(redirectContext, app);
    assert.equal(redirectContext.response.statusCode, 301);
    assert.equal(redirectContext.response.getHeader("location"), "/target");

    const linksContext = createContext("GET", "/links");
    await app.handle(linksContext, app);
    assert.match(linksContext.response.getHeader("link") ?? "", /rel="next"/);
    assert.match(linksContext.response.getHeader("link") ?? "", /rel="last"/);

    const formatContext = createContext("GET", "/format", {
      headers: { accept: "text/plain" }
    });
    await app.handle(formatContext, app);
    assert.equal(formatContext.response.getHeader("vary"), "Accept");
    assert.equal(formatContext.response.getHeader("content-type"), "text/plain");
    assert.equal(formatContext.response.bodyText, "plain:text/plain");

    const sendFileContext = createContext("GET", "/send-file");
    await app.handle(sendFileContext, app);
    assert.equal(sendFileContext.response.getHeader("content-type"), "text/plain");
    assert.deepEqual(
      Array.from(sendFileContext.response.bodyBytes ?? new Uint8Array()),
      Array.from(new TextEncoder().encode("hello file"))
    );

    const downloadContext = createContext("GET", "/download");
    await app.handle(downloadContext, app);
    assert.match(
      downloadContext.response.getHeader("content-disposition") ?? "",
      /attachment; filename="report.txt"/
    );
    assert.equal(downloadContext.response.getHeader("content-type"), "text/plain");

    const statusContext = createContext("GET", "/status");
    await app.handle(statusContext, app);
    assert.equal(statusContext.response.statusCode, 204);
    assert.equal(statusContext.response.getHeader("content-type"), "text/plain");
    assert.equal(statusContext.response.getHeader("x-one"), "1");
    assert.equal(statusContext.response.getHeader("x-two"), "2");
    assert.equal(statusContext.response.bodyText, "204");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("params indexer is safe and coerces values to string", () => {
  const params = new Params();
  assert.equal(params.get("missing"), undefined);

  params.set("id", "42");
  assert.equal(params.get("id"), "42");
  assert.equal(params.get("ID"), "42");

  params.set("n", 123);
  assert.equal(params.get("n"), "123");
});
