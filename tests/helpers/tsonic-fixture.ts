import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

export const repoRoot = resolve(process.cwd());

export function run(cwd: string, command: string, args: string[], env?: NodeJS.ProcessEnv): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    stdio: "pipe",
    timeout: 300_000,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      ...env
    }
  });

  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed${result.error === undefined ? "" : `: ${result.error.message}`}\nSTDOUT:\n${result.stdout ?? ""}\nSTDERR:\n${result.stderr ?? ""}`
  );

  return result.stdout ?? "";
}

export function runTsonic(cwd: string, args: string[], env?: NodeJS.ProcessEnv): string {
  return run(cwd, join(cwd, "node_modules", ".bin", "tsonic"), args, env);
}

export function packLocalPackage(dir: string): string {
  run(repoRoot, "npm", ["pack", "--pack-destination", dir]);
  const tarball = readdirSync(dir).find((entry) => entry.endsWith(".tgz"));
  assert.ok(tarball, "expected npm pack to create a tarball");
  return join(dir, tarball);
}

export async function withTempFixture(runFixture: (dir: string) => Promise<void>): Promise<void> {
  const fixtureRoot = join(repoRoot, ".temp");
  mkdirSync(fixtureRoot, { recursive: true });
  const dir = mkdtempSync(join(fixtureRoot, "express-fixture-"));
  try {
    await runFixture(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function writeFixtureApp(dir: string, source: string): void {
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "App.ts"), source, "utf-8");
}
