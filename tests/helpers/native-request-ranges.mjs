import { readFileSync } from "node:fs";

export const nativeRequestRangeFiles = {
  "ranges.ts": readFileSync(new URL("../../src/runtime/request-ranges.ts", import.meta.url), "utf8"),
};

export const nativeRequestRangesSource = `
import { parseRangeHeader, type FileOffset } from "./ranges.js";
export function firstStart(header: string, size: FileOffset): FileOffset {
  const parsed = parseRangeHeader(header, size);
  if (typeof parsed === "number") return 0;
  return parsed.ranges[0]!.start;
}
export function firstEnd(header: string, size: FileOffset): FileOffset {
  const parsed = parseRangeHeader(header, size);
  if (typeof parsed === "number") return 0;
  return parsed.ranges[0]!.end;
}
export function status(header: string, size: FileOffset): number {
  const parsed = parseRangeHeader(header, size);
  if (typeof parsed === "number") return parsed;
  return 0;
}
export function combinedCount(header: string, size: FileOffset): number {
  const parsed = parseRangeHeader(header, size, { combine: true });
  if (typeof parsed === "number") return parsed;
  return parsed.ranges.length;
}
`;
