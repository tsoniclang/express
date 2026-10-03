import { readFileSync } from "node:fs";

export const nativeByteCountFiles = {
  "byte-counts.ts": readFileSync(new URL("../../src/runtime/byte-counts.ts", import.meta.url), "utf8"),
};

export const nativeByteCountSource = `
import { Buffer } from "node:buffer";
import type { BufferByteLength, FileByteLength } from "./byte-counts.js";

export function echoBuffered(value: BufferByteLength): BufferByteLength {
  return value;
}
export function echoStreamed(value: FileByteLength): FileByteLength {
  return value;
}
export function concatChunks(chunks: Buffer[]): Buffer {
  let total: BufferByteLength = 0;
  for (const chunk of chunks) total += chunk.length;
  return Buffer.concat(chunks, total);
}
export function fieldLength(value: FileByteLength): BufferByteLength {
  if (value < 0 || value > 64 * 1024) throw new Error("field limit");
  return value as BufferByteLength;
}
`;
