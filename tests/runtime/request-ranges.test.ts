import assert from "node:assert/strict";
import test from "node:test";
import { parseRangeHeader, ParsedByteRange, ParsedRangeResult } from "../../src/runtime/request-ranges.js";

test("file ranges preserve exact closed, open and suffix bounds", () => {
  for (const [header, bounds] of [
    ["bytes=2-4", [[2, 4]]],
    ["bytes=2-", [[2, 99]]],
    ["bytes=-3", [[97, 99]]],
    ["bytes=0-0, 99-99", [[0, 0], [99, 99]]],
    ["bytes=50-40, 1-2", [[1, 2]]],
    ["bytes=0002-0004", [[2, 4]]],
  ] as const) {
    assert.deepEqual(parseRangeHeader(header, 100), new ParsedRangeResult("bytes",
      bounds.map(([start, end]) => new ParsedByteRange(start, end))));
  }
});

test("file ranges reject malformed and unsatisfiable input", () => {
  for (const header of [undefined, "", "bytes", "bytes=", "items=0-1", "=0-1"]) {
    assert.equal(parseRangeHeader(header, 100), -2, header);
  }
  for (const header of ["bytes=100-", "bytes=-0", "bytes=-", "bytes=1.2-4", "bytes=+2-4",
    "bytes=2-1", "bytes=1--4", "bytes=1-4x", "bytes=999999999999999999999x-4"]) {
    assert.equal(parseRangeHeader(header, 100), -1, header);
  }
  for (const size of [0, -1]) assert.equal(parseRangeHeader("bytes=0-1", size), -1);
});

test("file ranges saturate only valid oversized decimal ends and suffixes", () => {
  const oversized = "9".repeat(200);
  assert.deepEqual(parseRangeHeader(`bytes=2-${oversized}`, 100),
    new ParsedRangeResult("bytes", [new ParsedByteRange(2, 99)]));
  assert.deepEqual(parseRangeHeader(`bytes=-${oversized}`, 100),
    new ParsedRangeResult("bytes", [new ParsedByteRange(0, 99)]));
  assert.equal(parseRangeHeader(`bytes=${oversized}-`, 100), -1);
  assert.equal(parseRangeHeader(`bytes=2-${oversized}x`, 100), -1);
  assert.equal(parseRangeHeader(`bytes=-${oversized}x`, 100), -1);
});

test("file ranges combine overlaps and adjacent ranges in native order", () => {
  assert.deepEqual(parseRangeHeader("bytes=30-39,0-9,10-20,18-30", 100, { combine: true }),
    new ParsedRangeResult("bytes", [new ParsedByteRange(0, 39)]));
  assert.deepEqual(parseRangeHeader("bytes=30-39,0-9,20-29", 100, { combine: true }),
    new ParsedRangeResult("bytes", [new ParsedByteRange(0, 9), new ParsedByteRange(20, 39)]));
});
