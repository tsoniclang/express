import type { int32 } from "@tsonic/core/types.js";

export function toHttpStatusCode(value: number): int32 {
  if (Number.isInteger(value) && value >= 100 && value <= 999) {
    return value as int32;
  }

  throw new RangeError("HTTP status code must be an integer in the range 100..999.");
}
