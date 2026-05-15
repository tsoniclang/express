import type { int } from "@tsonic/core/types.js";

export function toHttpStatusCode(value: number): int {
  if (Number.isInteger(value) && value >= 100 && value <= 999) {
    return value as int;
  }

  throw new RangeError("HTTP status code must be an integer in the range 100..999.");
}
