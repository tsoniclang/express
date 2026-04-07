import test from "node:test";
import { join } from "node:path";

import { copyNativeSources, repoRoot, run, runTsonic, withTempFixture, writeFixtureApp } from "../helpers/tsonic-fixture.js";

test("native express sources compile and run through tsonic", () => {
  withTempFixture((dir) => {
    runTsonic(dir, ["init", "--surface", "@tsonic/js"]);
    run(dir, "npm", ["install", `file:${join(repoRoot, "..", "js", "versions", "10")}`]);
    run(
      dir,
      "npm",
      ["install", `file:${join(repoRoot, "..", "nodejs", "versions", "10")}`]
    );
    const projectName = dir.split("/").filter(Boolean).at(-1);
    if (!projectName) {
      throw new Error("missing project name");
    }
    const projectSrcDir = join(dir, "packages", projectName, "src");
    copyNativeSources(projectSrcDir);

    writeFixtureApp(
      dir,
      `import { express } from "./express/index.js";
import type { TransportContext, TransportResponse } from "./express/runtime/types.js";
import { HttpClient } from "@tsonic/dotnet/System.Net.Http.js";

class MemoryResponse implements TransportResponse {
  statusCode: number = 200;
  headersSent: boolean = false;
  headers: Record<string, string> = {};
  bodyText: string = "";

  appendHeader(name: string, value: string): void {
    const key = name.toLowerCase();
    const current = this.headers[key];
    this.headers[key] = current ? current + ", " + value : value;
  }

  getHeader(name: string): string | undefined {
    return this.headers[name.toLowerCase()];
  }

  setHeader(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value;
  }

  sendBytes(_bytes: Uint8Array): void {
    this.headersSent = true;
  }

  sendText(text: string): void {
    this.bodyText = text;
    this.headersSent = true;
  }
}

export async function main(): Promise<void> {
  const app = express.create();
  let mounted = false;

  app.set("jsonp callback name", "cb");
  app.engine("tpl", (_view, locals, callback) => callback(undefined, "hello " + locals["name"]));
  app.param("id", async (_req, _res, next, _value, _name) => {
    await next();
  });

  const child = express.create();
  child.get("/child", async (_req, res, _next) => {
    res.send("child");
  });
  app.use("/api", child);
  app.get("/items/:id",
    async (_req, _res, next) => {
      await next("route");
    },
    async (_req, res, _next) => {
      res.send("wrong");
    });
  app.get("/items/:id", async (req, res, _next) => {
    res.cookie("sid", "abc", { path: "/" });
    res.render("home.tpl", { name: req.param("id") });
  });

  const response = new MemoryResponse();
  const context: TransportContext = {
    request: {
      method: "GET",
      path: "/items/world",
      headers: {}
    },
    response
  };

  await express.dispatch(app, context);
  if (response.bodyText !== "hello world") throw new Error("render failed");
  if (response.getHeader("set-cookie")?.includes("sid=abc") !== true) throw new Error("cookie failed");

  const mountedResponse = new MemoryResponse();
  await express.dispatch(app, {
    request: {
      method: "GET",
      path: "/api/child",
      headers: {}
    },
    response: mountedResponse
  });
  if (mountedResponse.bodyText !== "child") throw new Error("mounted child failed");

  const jsonpResponse = new MemoryResponse();
  app.get("/jsonp", async (_req, res, _next) => {
    res.jsonp({ ok: true });
  });
  await express.dispatch(app, {
    request: {
      method: "GET",
      path: "/jsonp",
      headers: {}
    },
    response: jsonpResponse
  });
  if (!jsonpResponse.bodyText.startsWith("cb(")) throw new Error("jsonp failed");

  const errorResponse = new MemoryResponse();
  app.get("/boom", () => {
    throw new Error("boom");
  });
  app.useError(async (_error, _req, res, _next) => {
    res.status(500).send("handled");
  });
  await express.dispatch(app, {
    request: {
      method: "GET",
      path: "/boom",
      headers: {}
    },
    response: errorResponse
  });
  if (errorResponse.statusCode !== 500) throw new Error("error handler failed");
  if (errorResponse.bodyText !== "handled") throw new Error("error response failed");

  const liveApp = express.create();
  liveApp.use(express.json());
  liveApp.use(express.urlencoded());
  liveApp.get("/health", async (_req, res, _next) => {
    res.json({ ok: true });
  });

  const server = liveApp.listen(0, "127.0.0.1");
  const port = server.port;
  if (typeof port !== "number") throw new Error("server port missing");

  const client = new HttpClient();
  try {
    const liveBody = await client.GetStringAsync(\`http://127.0.0.1:\${String(port)}/health\`);
    if (liveBody !== "{\\"ok\\":true}") throw new Error("live listen failed");
  } finally {
    client.Dispose();
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
}
`
    );

    runTsonic(dir, ["build"]);
    run(join(dir, "packages", projectName, "out"), `./${projectName}`, []);
  });
});
