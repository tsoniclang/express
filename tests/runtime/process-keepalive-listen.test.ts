import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AppServer, express, Application } from "../../src/index.js";

async function waitFor(url: string): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5_000) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.text();
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForSocket(
  socketPath: string,
  path: string
): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5_000) {
    try {
      const body = await new Promise<string>((resolve, reject) => {
        const req = httpRequest(
          {
            socketPath,
            path,
            method: "GET"
          },
          (response) => {
            const chunks: string[] = [];
            response.setEncoding("utf8");
            response.on("data", (chunk) => {
              chunks.push(chunk);
            });
            response.on("end", () => {
              resolve(chunks.join(""));
            });
          }
        );
        req.on("error", reject);
        req.end();
      });

      if (body.length > 0) {
        return body;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Timed out waiting for unix socket ${socketPath}`);
}

async function closeServer(server: AppServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

test("application can be created and exposes router property", () => {
  const app = express.create();
  assert.ok(app instanceof Application);
  assert.equal(app.router, app);
});

test("application settings survive enable disable cycle", () => {
  const app = express.create();

  app.enable("keep-alive");
  assert.equal(app.enabled("keep-alive"), true);

  app.disable("keep-alive");
  assert.equal(app.disabled("keep-alive"), true);
  assert.equal(app.enabled("keep-alive"), false);
});

test("mountpath defaults to slash", () => {
  const app = express.create();
  assert.equal(app.mountpath, "/");
});

test("set and get round trip arbitrary settings", () => {
  const app = express.create();

  app.set("port", 3000);
  assert.equal(app.get("port"), 3000);

  app.set("host", "127.0.0.1");
  assert.equal(app.get("host"), "127.0.0.1");
});

test("listen serves requests and close updates listening state", async () => {
  const port = 32131;
  const app = express.create();
  app.get("/health", async (_req, res, _next) => {
    res.json({ ok: true });
  });

  let callbackInvoked = false;
  const server = app.listen(port, () => {
    callbackInvoked = true;
  });

  const body = await waitFor(`http://127.0.0.1:${String(port)}/health`);
  assert.equal(body, "{\"ok\":true}");
  assert.equal(callbackInvoked, true);
  assert.equal(server.port, port);
  assert.equal(server.host, undefined);
  assert.equal(server.listening, true);

  await closeServer(server);
  assert.equal(server.listening, false);
});

test("listen supports host and backlog overloads", async () => {
  const port = 32132;
  const app = express.create();
  app.get("/hosted", async (_req, res, _next) => {
    res.send("hosted");
  });

  const server = app.listen(port, "127.0.0.1", 128, () => {});
  const body = await waitFor(`http://127.0.0.1:${String(port)}/hosted`);

  assert.equal(body, "hosted");
  assert.equal(server.port, port);
  assert.equal(server.host, "127.0.0.1");

  await closeServer(server);
});

test("listen supports unix socket paths", async () => {
  const socketPath = join(
    tmpdir(),
    `express-${randomUUID()}.sock`
  );
  const app = express.create();
  app.get("/socket", async (_req, res, _next) => {
    res.send("socket-ok");
  });

  const server = app.listen(socketPath, () => {});
  const body = await waitForSocket(socketPath, "/socket");

  assert.equal(body, "socket-ok");
  assert.equal(server.path, socketPath);
  assert.equal(server.listening, true);

  await closeServer(server);
  if (existsSync(socketPath)) {
    rmSync(socketPath);
  }
});
