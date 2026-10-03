import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

test("repository hygiene admits one active PR and rejects dirty, detached and extra branches", () => {
  const temporary = resolve(".temp");
  mkdirSync(temporary, { recursive: true });
  const root = mkdtempSync(join(temporary, "branch-hygiene-"));
  mkdirSync(join(root, "scripts"));
  writeFileSync(join(root, "scripts/check-branch-hygiene.sh"), readFileSync(resolve("scripts/check-branch-hygiene.sh")));
  function git(...arguments_: string[]): void {
    const result = spawnSync("git", arguments_, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
  function check(expected: number, message?: RegExp): void {
    const result = spawnSync("bash", ["scripts/check-branch-hygiene.sh"], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, expected, result.stdout + result.stderr);
    if (message !== undefined) assert.match(result.stdout + result.stderr, message);
  }
  git("init", "--initial-branch=fixture-seed");
  git("config", "user.name", "Test Fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("add", "scripts/check-branch-hygiene.sh");
  git("commit", "--message=Initial test fixture");
  git("branch", "main");
  git("checkout", "-b", "fixture-pr");
  git("branch", "--delete", "fixture-seed");
  check(0);
  writeFileSync(join(root, "dirty.txt"), "dirty");
  check(1, /working tree is dirty/u);
  git("add", "dirty.txt");
  git("commit", "--message=Active fixture PR");
  check(0);
  git("branch", "additional-pr");
  check(1, /additional local branch 'additional-pr'/u);
  git("branch", "--delete", "additional-pr");
  git("checkout", "--detach");
  check(1, /detached checkout/u);
  git("checkout", "fixture-pr");
  git("branch", "--delete", "main");
  check(1, /local main branch is missing/u);
  git("branch", "main");
  check(0);
  git("checkout", "main");
  check(1, /additional local branch 'fixture-pr'/u);
  git("branch", "--delete", "fixture-pr");
  check(0);
});
