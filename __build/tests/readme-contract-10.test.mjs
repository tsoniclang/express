import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import http from "node:http";
import {
  ensureLocalRuntimeNugetConfig,
  expressLocalSpec,
  jsLocalSpec,
  overlayInstalledBindingsPackage,
  repoRoot,
  run,
  runTsonic,
} from "./test-helpers.mjs";

  const httpRequest = (method, url, body, headers = {}) =>
    new Promise((resolvePromise, rejectPromise) => {
      const u = new URL(url);
      const req = http.request(
        {
        method,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolvePromise({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf-8"),
            headers: res.headers,
          });
        });
      }
    );
    req.on("error", rejectPromise);
    if (body !== undefined) req.write(body);
    req.end();
  });

const waitForHttpOk = async (url, timeoutMs) => {
  const startedAt = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const r = await httpRequest("GET", url);
      if (r.status >= 200 && r.status < 600) return;
    } catch {
      // ignore while starting
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timeout waiting for server: ${url}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
};

const readSnippet = (rel) =>
  readFileSync(join(repoRoot, rel), "utf-8").replace(/\r\n/g, "\n").trimEnd();

test("express README contract (net10)", async () => {
  const expressSpec = process.env.PUBLISHED ? "@tsonic/express" : expressLocalSpec;

  const dir = mkdtempSync(join(tmpdir(), "tsonic-express-readme-"));
  try {
    runTsonic(dir, ["init", "--surface", "@tsonic/js"]);
    if (!process.env.PUBLISHED) {
      run(dir, "npm", ["install", jsLocalSpec]);
      overlayInstalledBindingsPackage(dir, "@tsonic/js");
    }
    runTsonic(dir, ["add", "npm", expressSpec]);
    if (!process.env.PUBLISHED) {
      overlayInstalledBindingsPackage(dir, "@tsonic/express");
    }

    // Local development mode: allow restoring against a sibling express-clr pack output
    // before it's published to nuget.org.
    if (!process.env.PUBLISHED) ensureLocalRuntimeNugetConfig(dir);

    const projectName = dir.split("/").filter(Boolean).at(-1);
    assert.ok(projectName);
    const projectRoot = join(dir, "packages", projectName);
    const srcDir = join(projectRoot, "src");

    const port = 31000 + Math.floor(Math.random() * 1000);

    const runtimeApp = `import { express } from "@tsonic/express/index.js";

export function main(): void {
  ${readSnippet("docs/snippets/10/create-app-router.ts")}

  ${readSnippet("docs/snippets/10/body-parsing.ts")}

  ${readSnippet("docs/snippets/10/cors.ts")}

  ${readSnippet("docs/snippets/10/cookies.ts")}

  ${readSnippet("docs/snippets/10/multipart.ts")}

  ${readSnippet("docs/snippets/10/static-files.ts")}

  ${readSnippet("docs/snippets/10/middleware.ts")}

  ${readSnippet("docs/snippets/10/routing.ts")}

  // Extra endpoints for the contract test harness.
  app.get("/", async (_req, res, _next) => {
    res.json({ ok: true });
  });

  ${readSnippet("docs/snippets/10/error-middleware.ts")}

  app.listen(${port});
}
`;

    writeFileSync(join(srcDir, "App.ts"), runtimeApp, "utf-8");

    const compileOnly = `import { express } from "@tsonic/express/index.js";

export function _readme_snippets_compile_only(): void {
  const app = express.create();
  const router = express.Router();
  void router;

  ${readSnippet("docs/snippets/10/listen-close.ts")}
}
`;
    writeFileSync(join(srcDir, "ReadmeSnippets.ts"), compileOnly, "utf-8");

    mkdirSync(join(dir, "public"), { recursive: true });
    writeFileSync(join(dir, "public", "hello.txt"), "hello", "utf-8");

    runTsonic(dir, ["build"], {
      env: {
        ...process.env,
        NUGET_PACKAGES: join(dir, ".nuget", "packages"),
      },
    });

    const binPath = join(projectRoot, "out", projectName);
    const proc = spawn(binPath, { cwd: dir, stdio: "inherit" });
    try {
      await waitForHttpOk(`http://127.0.0.1:${port}/health`, 20_000);

      {
        const r = await httpRequest("GET", `http://127.0.0.1:${port}/health`);
        assert.equal(r.status, 200);
        assert.equal(r.body, "ok");
      }

      {
        const r = await httpRequest("PUT", `http://127.0.0.1:${port}/items/xyz`);
        assert.equal(r.status, 200);
        assert.equal(r.body, "xyz");
      }

      {
        const body = JSON.stringify({ a: 1, b: "x" });
        const r = await httpRequest("POST", `http://127.0.0.1:${port}/items`, body, {
          "Content-Type": "application/json",
          "Content-Length": String(Buffer.byteLength(body)),
        });
        assert.equal(r.status, 200);
        assert.deepEqual(JSON.parse(r.body), JSON.parse(body));
      }

      {
        const r = await httpRequest("GET", `http://127.0.0.1:${port}/hello.txt`);
        assert.equal(r.status, 200);
        assert.equal(r.body, "hello");
      }

      {
        const r = await httpRequest("GET", `http://127.0.0.1:${port}/api/ping`);
        assert.equal(r.status, 200);
        assert.equal(r.body, "pong");
      }

      {
        const r = await httpRequest("OPTIONS", `http://127.0.0.1:${port}/items`, undefined, {
          Origin: "https://example.com",
          "Access-Control-Request-Method": "POST",
        });
        assert.equal(r.status, 204);
        assert.equal(r.headers["access-control-allow-origin"], "*");
      }

      {
        const r = await httpRequest("GET", `http://127.0.0.1:${port}/set-cookie`);
        assert.equal(r.status, 200);
        const setCookie = r.headers["set-cookie"];
        assert.ok(setCookie);
        const cookieHeader = (Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0];
        const read = await httpRequest("GET", `http://127.0.0.1:${port}/read-cookie`, undefined, {
          Cookie: cookieHeader,
        });
        assert.equal(read.status, 200);
        assert.equal(JSON.parse(read.body).sid, "abc");
      }

      {
        const boundary = "----tsonic-contract";
        const body =
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="title"\r\n\r\n` +
          `hello\r\n` +
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="avatar"; filename="a.txt"\r\n` +
          `Content-Type: text/plain\r\n\r\n` +
          `file\r\n` +
          `--${boundary}--\r\n`;
        const r = await httpRequest("POST", `http://127.0.0.1:${port}/upload`, body, {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": String(Buffer.byteLength(body)),
        });
        assert.equal(r.status, 200);
        const json = JSON.parse(r.body);
        assert.equal(json.filename, "a.txt");
        assert.equal(json.fields.title, "hello");
      }
    } finally {
      const waitForExit = async (timeoutMs) => {
        if (proc.exitCode !== null) return true;
        return await new Promise((resolvePromise) => {
          const timer = setTimeout(() => resolvePromise(false), timeoutMs);
          proc.once("exit", () => {
            clearTimeout(timer);
            resolvePromise(true);
          });
        });
      };

      // Best-effort graceful shutdown, then hard kill.
      proc.kill("SIGINT");
      if (!(await waitForExit(5_000))) {
        proc.kill("SIGTERM");
        if (!(await waitForExit(5_000))) {
          proc.kill("SIGKILL");
          await waitForExit(5_000);
        }
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
