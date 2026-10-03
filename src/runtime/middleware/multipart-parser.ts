import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import { createWriteStream, type WriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BufferByteLength, FileByteLength } from "../byte-counts.js";
import type { MultipartField } from "../options.js";
import type { Request } from "../request.js";
import type { RequestFailure, TransportError } from "../types.js";
import { readHeaderParameter } from "../header-parameters.js";
import { requireSafeRecordKey } from "../safe-record-key.js";
import { DiskTransportFile, type TransportFile } from "../request-uploaded-file.js";

export type MultipartMode = "any" | "none" | "single" | "fields";

export interface MultipartRules {
  readonly mode: MultipartMode;
  readonly allowList?: readonly MultipartField[];
  readonly maxFileCount?: number;
  readonly maxFileSizeBytes?: FileByteLength;
}

export interface ParsedMultipart {
  readonly body: Record<string, unknown> | undefined;
  readonly files: readonly TransportFile[];
}

interface ActivePart {
  readonly name: string;
  readonly filename?: string;
  readonly mimetype: string;
  path?: string;
  sink?: WriteStream;
  readonly fieldChunks: Buffer[];
  size: FileByteLength;
  error?: TransportError;
}

const CRLF = Buffer.from("\r\n");
const HEADER_END = Buffer.from("\r\n\r\n");
const MAX_PART_HEADERS: BufferByteLength = 16 * 1024;
const MAX_FIELD_BYTES: FileByteLength = 64 * 1024;
const MAX_TOTAL_FIELD_BYTES: BufferByteLength = 1024 * 1024;
const MAX_FIELDS = 128;
const DEFAULT_MAX_FILE_BYTES: FileByteLength = 64 * 1024 * 1024;
const DEFAULT_MAX_FILES = 64;

export async function parseMultipartStream(
  req: Request,
  boundary: string,
  rules: MultipartRules
): Promise<ParsedMultipart> {
  if (boundary.length === 0 || boundary.length > 70 || boundary.includes("\r") || boundary.includes("\n")) {
    throw new Error("Invalid multipart boundary.");
  }
  const parser = new MultipartParser(boundary, rules, req.transport.cleanup);
  const source = req.takeBody();
  return await new Promise<ParsedMultipart>((resolve, reject) => {
    let settled = false;
    let sourceEnded = false;
    let processing: Promise<void> = Promise.resolve(undefined);
    const detach = (): void => {
      source.off("data", onData);
      source.off("end", onEnd);
      source.off("error", onError);
      source.off("close", onClose);
    };
    const fail = (error: RequestFailure): void => {
      if (settled) return;
      settled = true;
      detach();
      source.destroy(undefined);
      reject(error);
    };
    const processChunk = async (previous: Promise<void>, chunk: Buffer): Promise<void> => {
      await previous;
      await parser.feed(chunk);
    };
    const finish = async (): Promise<void> => {
      await processing;
      const result = await parser.complete();
      if (settled) return;
      settled = true;
      detach();
      resolve(result);
    };
    const failUnknown = (reason: unknown): void => {
      fail(reason instanceof Error ? reason : new Error("Multipart parsing failed."));
    };
    const onData = (chunk: Buffer): void => {
      source.pause();
      processing = processChunk(processing, chunk);
      void processing.then(() => { source.resume(); }, failUnknown);
    };
    const onEnd = (): void => {
      sourceEnded = true;
      void finish().catch(failUnknown);
    };
    const onError = (error: TransportError): void => fail(error);
    const onClose = (): void => {
      if (!sourceEnded) fail(new Error("Multipart request closed before completion."));
    };
    source.on("data", onData);
    source.once("end", onEnd);
    source.once("error", onError);
    source.once("close", onClose);
  });
}

class MultipartParser {
  readonly #opening: Buffer;
  readonly #delimiter: Buffer;
  readonly #rules: MultipartRules;
  readonly #cleanup: Array<() => Promise<void>>;
  readonly #fields: Record<string, unknown> = {};
  readonly #files: TransportFile[] = [];
  readonly #allowedCounts: Record<string, number | undefined> = {};
  #fieldCount = 0;
  #fieldBytes: BufferByteLength = 0;
  #pending: Buffer = Buffer.alloc(0);
  #phase: "opening" | "headers" | "body" | "closing" | "done" = "opening";
  #active: ActivePart | undefined;

  constructor(boundary: string, rules: MultipartRules, cleanup: Array<() => Promise<void>>) {
    this.#opening = Buffer.from(`--${boundary}`);
    this.#delimiter = Buffer.from(`\r\n--${boundary}`);
    this.#rules = rules;
    this.#cleanup = cleanup;
  }

  async feed(chunk: Buffer): Promise<void> {
    if (this.#phase === "done") {
      if (chunk.length !== 0) throw new Error("Unexpected multipart epilogue.");
      return;
    }
    this.#pending = this.#pending.length === 0
      ? chunk
      : Buffer.concat([this.#pending, chunk]);
    if (this.#phase === "closing") {
      this.consumeClosingSuffix();
      return;
    }

    while (true) {
      if (this.#phase === "opening") {
        if (this.#pending.length < this.#opening.length + 2) return;
        if (this.#pending.indexOf(this.#opening) !== 0) {
          throw new Error("Multipart payload did not start with the expected boundary.");
        }
        const suffix = this.#opening.length;
        if (this.#pending.readUInt8(suffix) === 45 && this.#pending.readUInt8(suffix + 1) === 45) {
          this.#pending = this.#pending.subarray(suffix + 2);
          this.#phase = "closing";
          this.consumeClosingSuffix();
          return;
        }
        if (!hasCrLf(this.#pending, suffix)) throw new Error("Malformed multipart boundary.");
        this.#pending = this.#pending.subarray(suffix + 2);
        this.#phase = "headers";
      }

      if (this.#phase === "headers") {
        const end = this.#pending.indexOf(HEADER_END);
        if (end < 0) {
          if (this.#pending.length > MAX_PART_HEADERS) throw new Error("Multipart part headers are too large.");
          return;
        }
        if (end > MAX_PART_HEADERS) throw new Error("Multipart part headers are too large.");
        await this.beginPart(this.#pending.subarray(0, end).toString("utf-8"));
        this.#pending = this.#pending.subarray(end + HEADER_END.length);
        this.#phase = "body";
      }

      if (this.#phase === "body") {
        const position = this.findDelimiter();
        if (position === -2) return;
        if (position < 0) {
          const ready = Math.max(0, this.#pending.length - this.#delimiter.length - 2);
          if (ready === 0) return;
          await this.writePart(this.#pending.subarray(0, ready));
          this.#pending = this.#pending.subarray(ready);
          return;
        }

        await this.writePart(this.#pending.subarray(0, position));
        await this.endPart();
        const suffix = position + this.#delimiter.length;
        const final = this.#pending.readUInt8(suffix) === 45;
        this.#pending = this.#pending.subarray(suffix + 2);
        this.#phase = final ? "closing" : "headers";
        if (final) {
          this.consumeClosingSuffix();
          return;
        }
      }
    }
  }

  async complete(): Promise<ParsedMultipart> {
    if (this.#phase !== "done" && !(this.#phase === "closing" && this.#pending.length === 0)) {
      throw new Error("Multipart body ended before its closing boundary.");
    }
    return {
      body: Object.keys(this.#fields).length > 0 ? this.#fields : undefined,
      files: this.#files
    };
  }

  private consumeClosingSuffix(): void {
    if (this.#pending.length > 2 ||
        this.#pending.length > 0 && this.#pending.readUInt8(0) !== 13 ||
        this.#pending.length === 2 && this.#pending.readUInt8(1) !== 10) {
      throw new Error("Unexpected multipart epilogue.");
    }
    if (this.#pending.length === 2) {
      this.#pending = Buffer.alloc(0);
      this.#phase = "done";
    }
  }

  findDelimiter(): number {
    let start = 0;
    while (true) {
      const position = this.#pending.indexOf(this.#delimiter, start);
      if (position < 0) return -1;
      const suffix = position + this.#delimiter.length;
      if (this.#pending.length < suffix + 2) return -2;
      if (hasCrLf(this.#pending, suffix) ||
          (this.#pending.readUInt8(suffix) === 45 && this.#pending.readUInt8(suffix + 1) === 45)) {
        return position;
      }
      start = position + 1;
    }
  }

  async beginPart(rawHeaders: string): Promise<void> {
    const headers = parseHeaders(rawHeaders);
    const disposition = headers["content-disposition"];
    if (disposition === undefined || disposition.length === 0) throw new Error("Multipart part is missing Content-Disposition.");
    const name = readHeaderParameter(disposition, "name");
    if (name === undefined || name.length === 0) throw new Error("Multipart part is missing a field name.");
    requireSafeRecordKey(name);
    const filename = readHeaderParameter(disposition, "filename");
    const part: ActivePart = {
      name,
      filename,
      mimetype: headers["content-type"] ?? "application/octet-stream",
      fieldChunks: [],
      size: 0
    };

    if (filename === undefined) {
      this.#fieldCount += 1;
      if (this.#fieldCount > MAX_FIELDS) throw new Error("Too many multipart fields.");
    }

    if (filename !== undefined) {
      const count = this.#files.length + 1;
      if (this.#rules.mode === "none") throw new Error("Expected no files for multipart request.");
      if (count > (this.#rules.maxFileCount ?? DEFAULT_MAX_FILES)) throw new Error("Too many files.");
      this.validateFieldRule(name);
      const path = join(tmpdir(), `tsonic-express-${randomBytes(16).toString("hex")}`);
      part.path = path;
      this.#cleanup.push(async () => { await rm(path, { force: true }); });
      const sink = createWriteStream(path, { flags: "wx", mode: 0o600 });
      part.sink = sink;
      sink.on("error", (error: TransportError) => { part.error = error; });
    }
    this.#active = part;
  }

  validateFieldRule(name: string): void {
    const allowList = this.#rules.allowList;
    if (allowList === undefined) return;
    const rule = allowList.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
    if (rule === undefined) throw new Error(`Unexpected multipart field '${name}'.`);
    const key = rule.name.toLowerCase();
    const count = (this.#allowedCounts[key] ?? 0) + 1;
    if (count > (rule.maxCount ?? DEFAULT_MAX_FILES)) throw new Error(`Too many files for field '${name}'.`);
    this.#allowedCounts[key] = count;
  }

  async writePart(bytes: Buffer): Promise<void> {
    if (bytes.length === 0) return;
    const part = this.#active;
    if (part === undefined) throw new Error("Multipart part state is missing.");
    const limit = part.filename === undefined
      ? MAX_FIELD_BYTES
      : this.#rules.maxFileSizeBytes ?? DEFAULT_MAX_FILE_BYTES;
    if (bytes.length > limit - part.size) throw new Error("Multipart part exceeds its size limit.");
    part.size += bytes.length;
    if (part.sink === undefined) {
      this.#fieldBytes += bytes.length;
      if (this.#fieldBytes > MAX_TOTAL_FIELD_BYTES) {
        throw new Error("Multipart fields exceed their total size limit.");
      }
      part.fieldChunks.push(bytes);
      return;
    }
    if (part.error !== undefined) throw part.error;
    if (part.sink.write(bytes)) return;
    await new Promise<void>((resolve, reject) => {
      const onDrain = (): void => { part.sink!.off("error", onError); resolve(); };
      const onError = (error: TransportError): void => { part.sink!.off("drain", onDrain); reject(error); };
      part.sink!.once("drain", onDrain);
      part.sink!.once("error", onError);
    });
    if (part.error !== undefined) throw part.error;
  }

  async endPart(): Promise<void> {
    const part = this.#active;
    if (part === undefined) throw new Error("Multipart part state is missing.");
    this.#active = undefined;
    if (part.sink !== undefined && part.path !== undefined && part.filename !== undefined) {
      await new Promise<void>((resolve, reject) => {
        const onFinish = (): void => { part.sink!.off("error", onError); resolve(); };
        const onError = (error: TransportError): void => { part.sink!.off("finish", onFinish); reject(error); };
        part.sink!.once("finish", onFinish);
        part.sink!.once("error", onError);
        part.sink!.end();
      });
      if (part.error !== undefined) throw part.error;
      this.#files.push(new DiskTransportFile(
        part.path, part.name, part.filename, part.mimetype, part.size
      ));
      return;
    }
    const value = Buffer.concat(part.fieldChunks, part.size as BufferByteLength).toString("utf-8");
    const prior = this.#fields[part.name];
    if (prior === undefined) this.#fields[part.name] = value;
    else if (Array.isArray(prior)) (prior as string[]).push(value);
    else this.#fields[part.name] = [String(prior), value];
  }
}

function parseHeaders(raw: string): Record<string, string | undefined> {
  const headers: Record<string, string | undefined> = {};
  for (const line of raw.split("\r\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) throw new Error("Malformed multipart part header.");
    const name = line.slice(0, separator).trim().toLowerCase();
    requireSafeRecordKey(name);
    if (headers[name] !== undefined) throw new Error("Duplicate multipart part header.");
    headers[name] = line.slice(separator + 1).trim();
  }
  return headers;
}

function hasCrLf(value: Buffer, offset: number): boolean {
  return value.length >= offset + CRLF.length &&
    value.readUInt8(offset) === 13 && value.readUInt8(offset + 1) === 10;
}
