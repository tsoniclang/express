import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ensureLocalRuntimeNugetConfig,
  expressLocalSpec,
  jsLocalSpec,
  repoRoot,
  run,
  runTsonic,
} from "./test-helpers.mjs";

test("express package surface stays JS-native and package-focused", () => {
  const publicIndex = readFileSync(join(repoRoot, "versions", "10", "index.d.ts"), "utf-8");
  const internalIndex = readFileSync(
    join(repoRoot, "versions", "10", "index", "internal", "index.d.ts"),
    "utf-8"
  );
  const packageJson = JSON.parse(
    readFileSync(join(repoRoot, "versions", "10", "package.json"), "utf-8")
  );
  const jsPackageJson = JSON.parse(
    readFileSync(join(repoRoot, "..", "js", "versions", "10", "package.json"), "utf-8")
  );

  const forbiddenTokens = [
    "@tsonic/dotnet",
    "Dictionary_2",
    "IEnumerable_1",
    "Task_1",
    "Task;",
    "Action_1",
    "Action_2",
    "System_Internal",
    "Tsonic.JSRuntime/internal",
    "Nullable_1",
  ];

  for (const token of forbiddenTokens) {
    assert.equal(publicIndex.includes(token), false, `public surface leaked '${token}'`);
    assert.equal(internalIndex.includes(token), false, `internal surface leaked '${token}'`);
  }

  const requiredSnippets = [
    "VerifyBodyHandler = (req: Request, res: Response, buffer: Uint8Array, encoding: string) => void;",
    "listen(port: number, callback?: () => void): AppServer;",
    "statusCode: number;",
    "readonly locals: Record<string, unknown | undefined>;",
    "query: Record<string, unknown | undefined>;",
    "bytes(): Promise<Uint8Array>;",
    "text(): Promise<string>;",
    "save(path: string): Promise<void>;",
    "range(size: number, options?: RangeOptions): RangeResult | -1;",
  ];

  for (const snippet of requiredSnippets) {
    assert.match(internalIndex, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.deepEqual(packageJson.dependencies, { "@tsonic/js": jsPackageJson.version });
  assert.equal("peerDependencies" in packageJson, false);

  const pack = run(repoRoot, "npm", ["pack", "--json", "--dry-run", "./versions/10"]);
  const files = JSON.parse(pack.stdout)[0].files.map((entry) => entry.path).sort();

  assert.deepEqual(files, [
    "LICENSE",
    "README.md",
    "docs/advanced.md",
    "docs/deviations.md",
    "docs/generation.md",
    "docs/release.md",
    "families.json",
    "index.d.ts",
    "index.js",
    "index/bindings.json",
    "index/internal/index.d.ts",
    "package.json",
    "tsonic.bindings.json",
  ]);
});

test("express local package compiles in a JS-surface project with JS-native APIs", () => {
  const dir = mkdtempSync(join(tmpdir(), "tsonic-express-surface-"));

  try {
    runTsonic(dir, ["init", "--surface", "@tsonic/js"]);
    run(dir, "npm", ["install", jsLocalSpec]);
    runTsonic(dir, ["add", "npm", expressLocalSpec]);
    ensureLocalRuntimeNugetConfig(dir);

    const projectName = dir.split("/").filter(Boolean).at(-1);
    assert.ok(projectName);
    const appPath = join(dir, "packages", projectName, "src", "App.ts");

    writeFileSync(
      appPath,
      `import { CookieOptions, MultipartField, MultipartOptions, Request, Response, VerifyBodyHandler, express } from "@tsonic/express/index.js";

export function main(): void {
  const app = express.create();
  const cookie = new CookieOptions();
  cookie.expires = new Date(0);
  cookie.maxAge = 60_000;
  cookie.sameSite = "lax";

  const multipartOptions = new MultipartOptions();
  multipartOptions.maxFileCount = 2;
  multipartOptions.maxFileSizeBytes = 1024;

  const field = new MultipartField();
  field.name = "avatar";
  field.maxCount = 1;

  const verify: VerifyBodyHandler = (_req: Request, _res: Response, buffer: Uint8Array, encoding: string): void => {
    console.log(buffer.length.toString(), encoding);
  };

  app.use(express.json({
    limit: "1mb",
    type: ["application/json"],
    verify,
  }));

  app.use(express.text({ type: "text/plain" }));
  app.use(express.raw({ type: "application/octet-stream" }));
  app.use(express.urlencoded({ limit: "8kb", parameterLimit: 16, depth: 4 }));
  app.use(express.multipart(multipartOptions).fields([field]));

  app.get("/", async (req, res, next) => {
    const queryValue = req.query["id"];
    void queryValue;
    req.ips.map((ip) => ip.length);
    res.locals["startedAt"] = new Date();
    res.statusCode = 201;
    const range = req.range(1024);
    if (range !== -1) {
      range.ranges[0]?.start.toString();
    }
    res.set({ "x-app": "ok" });
    res.links({ next: "/next" });
    res.cookie("sid", "abc", cookie);
    res.render("home", { user: "sam" }, (_err, html) => {
      void html;
    });
    await next();
  });

  app.post("/upload", async (req, res, _next) => {
    const file = req.file;
    if (file !== undefined) {
      const bytes = await file.bytes();
      const text = await file.text();
      await file.save("./upload.bin");
      res.json({ size: file.size, bytes: bytes.length, text });
      return;
    }
    res.sendStatus(204);
  });

  const server = app.listen(3000, () => {});
  server.close();
}
`,
      "utf-8"
    );

    runTsonic(dir, ["build"], {
      env: {
        ...process.env,
        NUGET_PACKAGES: join(dir, ".nuget", "packages"),
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
