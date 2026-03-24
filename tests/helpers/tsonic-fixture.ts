import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

export const repoRoot = resolve(process.cwd());
const siblingTsonicBin = resolve(join(repoRoot, "..", "tsonic", "packages", "cli", "dist", "index.js"));
const localTsonicBin = process.env.TSONIC_BIN ?? (existsSync(siblingTsonicBin) ? siblingTsonicBin : undefined);

export function run(cwd: string, command: string, args: string[], env?: NodeJS.ProcessEnv): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    stdio: "pipe",
    env: {
      ...process.env,
      ...env
    }
  });

  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed\nSTDOUT:\n${result.stdout ?? ""}\nSTDERR:\n${result.stderr ?? ""}`
  );

  return result.stdout ?? "";
}

export function runTsonic(cwd: string, args: string[], env?: NodeJS.ProcessEnv): string {
  if (localTsonicBin) {
    return run(cwd, "node", [localTsonicBin, ...args], env);
  }

  return run(cwd, "npx", ["--yes", "tsonic@latest", ...args], env);
}

export function packLocalPackage(dir: string): string {
  run(repoRoot, "npm", ["pack", "--pack-destination", dir]);
  const tarball = readdirSync(dir).find((entry) => entry.endsWith(".tgz"));
  assert.ok(tarball, "expected npm pack to create a tarball");
  return join(dir, tarball);
}

export function copyNativeSources(projectSrcDir: string): void {
  cpSync(join(repoRoot, "src"), join(projectSrcDir, "express"), {
    recursive: true
  });
}

export function withTempFixture(runFixture: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "express-fixture-"));
  try {
    runFixture(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function writeFixtureApp(dir: string, source: string): string {
  const projectName = dir.split("/").filter(Boolean).at(-1);
  assert.ok(projectName);
  const appPath = join(dir, "packages", projectName, "src", "App.ts");
  writeFileSync(appPath, source, "utf-8");
  return projectName;
}
