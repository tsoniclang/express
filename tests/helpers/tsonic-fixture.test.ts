import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import test from "node:test";
import { withTempFixture } from "./tsonic-fixture.js";

test("successful source-package fixtures remove their generated artifacts", async () => {
  let directory = "";
  await withTempFixture(async (fixture) => {
    directory = fixture;
    assert.equal(existsSync(fixture), true);
  });
  assert.notEqual(directory, "");
  assert.equal(existsSync(directory), false);
});

test("failed source-package fixtures retain evidence and preserve the exact failure", async () => {
  const failure = new Error("fixture failure");
  let directory = "";
  try {
    await assert.rejects(withTempFixture(async (fixture) => {
      directory = fixture;
      throw failure;
    }), (error) => error === failure);
    assert.notEqual(directory, "");
    assert.equal(existsSync(directory), true);
  } finally {
    if (directory !== "") rmSync(directory, { recursive: true, force: true });
  }
});
