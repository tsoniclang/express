import test from "node:test";
import assert from "node:assert/strict";

import { Params } from "../../src/index.js";

test("Params indexer is safe and coerces values to string", () => {
  const params = new Params();
  assert.equal(params.get("missing"), undefined);

  params.set("id", "42");
  assert.equal(params.get("id"), "42");
  assert.equal(params.get("ID"), "42");

  params.set("n", 123);
  assert.equal(params.get("n"), "123");
});
