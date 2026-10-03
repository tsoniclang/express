import type { Buffer } from "node:buffer";
import type { WriteStream } from "node:fs";

export type BufferByteLength = Buffer["length"];
export type FileByteLength = WriteStream["bytesWritten"];
