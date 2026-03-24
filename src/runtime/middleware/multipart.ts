import type { MultipartField, MultipartOptions } from "../options.js";
import type { Request } from "../request.js";
import { UploadedFile, type TransportFile } from "../request-uploaded-file.js";
import type { Response } from "../response.js";
import type { NextFunction, RequestHandler } from "../types.js";
import { Readable } from "node:stream";
import { Buffer } from "node:buffer";

/**
 * Express-shaped multipart middleware factory.
 *
 * Mirrors the CLR `Multipart` class: construct with options, then call
 * `.any()`, `.none()`, `.single(name)`, `.array(name)`, or `.fields(fields)`
 * to get a middleware handler.
 */
export class Multipart {
  readonly #options: ParseOptions;

  constructor(options?: MultipartOptions) {
    this.#options = {
      type: options?.type ?? "multipart/form-data",
      maxFileCount: options?.maxFileCount,
      maxFileSizeBytes: options?.maxFileSizeBytes,
    };
  }

  /** Accept any files (no field-name constraints). */
  any(): RequestHandler {
    return async (req: Request, _res: Response, next: NextFunction) => {
      await parse(
        req,
        MultipartModeAny,
        undefined,
        next,
        this.#options.type,
        this.#options.maxFileCount,
        this.#options.maxFileSizeBytes
      );
    };
  }

  /** Accept the form but reject any file uploads. */
  none(): RequestHandler {
    return async (req: Request, _res: Response, next: NextFunction) => {
      await parse(
        req,
        MultipartModeNone,
        undefined,
        next,
        this.#options.type,
        this.#options.maxFileCount,
        this.#options.maxFileSizeBytes
      );
    };
  }

  /** Accept a single file on field `name`. */
  single(name: string): RequestHandler {
    const allowList: MultipartField[] = [{ name, maxCount: 1 }];
    return async (req: Request, _res: Response, next: NextFunction) => {
      await parse(
        req,
        MultipartModeSingle,
        allowList,
        next,
        this.#options.type,
        this.#options.maxFileCount,
        this.#options.maxFileSizeBytes
      );
    };
  }

  /** Accept multiple files on a single field `name`, with optional cap. */
  array(name: string, maxCount?: number): RequestHandler {
    const allowList: MultipartField[] = [{ name, maxCount }];
    return async (req: Request, _res: Response, next: NextFunction) => {
      await parse(
        req,
        MultipartModeFields,
        allowList,
        next,
        this.#options.type,
        this.#options.maxFileCount,
        this.#options.maxFileSizeBytes
      );
    };
  }

  /** Accept files according to the given field specification. */
  fields(fields: MultipartField[]): RequestHandler {
    return async (req: Request, _res: Response, next: NextFunction) => {
      await parse(
        req,
        MultipartModeFields,
        fields,
        next,
        this.#options.type,
        this.#options.maxFileCount,
        this.#options.maxFileSizeBytes
      );
    };
  }
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type MultipartMode = "any" | "none" | "single" | "fields";

const MultipartModeAny: MultipartMode = "any";
const MultipartModeNone: MultipartMode = "none";
const MultipartModeSingle: MultipartMode = "single";
const MultipartModeFields: MultipartMode = "fields";

type ParseOptions = {
  readonly type: string;
  readonly maxFileCount?: number;
  readonly maxFileSizeBytes?: number;
};

class MemoryTransportFile implements TransportFile {
  readonly fieldname: string;
  readonly originalname: string;
  readonly mimetype: string;
  readonly size: number;

  readonly #content: Uint8Array;

  constructor(
    fieldname: string,
    originalname: string,
    mimetype: string,
    content: Uint8Array
  ) {
    this.fieldname = fieldname;
    this.originalname = originalname;
    this.mimetype = mimetype;
    this.size = content.length;
    this.#content = content;
  }

  stream(): Readable {
    const stream = new Readable();
    stream.push(this.#content);
    stream.push(null);
    return stream;
  }

  async buffer(): Promise<Uint8Array> {
    return this.#content;
  }
}

// ---------------------------------------------------------------------------
// Core parse logic
// ---------------------------------------------------------------------------

async function parse(
  req: Request,
  mode: MultipartMode,
  allowList: MultipartField[] | undefined,
  next: NextFunction,
  expectedType: string,
  maxFileCount: number | undefined,
  maxFileSizeBytes: number | undefined
): Promise<void> {
  const contentType = req.get("content-type") ?? "";

  if (
    contentType.length === 0 ||
    !contentType.toLowerCase().includes(expectedType.toLowerCase())
  ) {
    await next(undefined);
    return;
  }

  const boundary = readBoundary(contentType);
  if (!boundary) {
    throw new Error("Multipart boundary is required.");
  }

  const bytes = readMultipartBytes(req);
  const parsed = parseMultipartBody(bytes, boundary);

  req.file = undefined;
  req.files.clear();
  req.body = parsed.body;

  if (parsed.files.length === 0) {
    await next(undefined);
    return;
  }

  if (mode === MultipartModeNone) {
    throw new Error("Expected no files for multipart request.");
  }

  if (
    maxFileCount !== undefined &&
    parsed.files.length > maxFileCount
  ) {
    throw new Error(`Too many files (max: ${String(maxFileCount)}).`);
  }

  const allowedCounts: Record<string, number> = {};
  for (let index = 0; index < parsed.files.length; index += 1) {
    const transportFile = parsed.files[index]!;
    if (
      maxFileSizeBytes !== undefined &&
      transportFile.size > maxFileSizeBytes
    ) {
      throw new Error(
        `File '${transportFile.originalname}' exceeds max size (${String(
          maxFileSizeBytes
        )} bytes).`
      );
    }

    if (allowList) {
      const rule = findAllowRule(allowList, transportFile.fieldname);
      if (!rule) {
        throw new Error(
          `Unexpected multipart field '${transportFile.fieldname}'.`
        );
      }

      if (rule.maxCount !== undefined) {
        const current = allowedCounts[rule.name.toLowerCase()] ?? 0;
        const nextCount = current + 1;
        allowedCounts[rule.name.toLowerCase()] = nextCount;
        if (nextCount > rule.maxCount) {
          throw new Error(
            `Too many files for field '${rule.name}' (max: ${String(
              rule.maxCount
            )}).`
          );
        }
      }
    }

    req.files.add(new UploadedFile(transportFile));
  }

  if (mode === MultipartModeSingle && allowList && allowList.length === 1) {
    const name = allowList[0]!.name;
    const files = req.files.get(name);
    if (files && files.length > 1) {
      throw new Error(`Too many files for field '${name}' (expected 1).`);
    }

    req.file = files?.[0];
  }

  await next(undefined);
}

type ParsedMultipartBody = {
  readonly body: Record<string, unknown> | undefined;
  readonly files: readonly TransportFile[];
};

function parseMultipartBody(
  bytes: Uint8Array,
  boundary: string
): ParsedMultipartBody {
  const raw = Buffer.from(bytes).toString("latin1");
  const delimiter = `--${boundary}`;
  if (!raw.startsWith(delimiter)) {
    throw new Error("Multipart payload did not start with the expected boundary.");
  }

  const fields: Record<string, unknown> = {};
  const files: TransportFile[] = [];

  const sections = raw.split(delimiter);
  for (let index = 1; index < sections.length; index += 1) {
    let section = sections[index]!;
    if (section.startsWith("--")) {
      break;
    }

    if (section.startsWith("\r\n")) {
      section = section.slice(2);
    }
    if (section.endsWith("\r\n")) {
      section = section.slice(0, section.length - 2);
    }
    if (section.length === 0) {
      continue;
    }

    const headerEnd = section.indexOf("\r\n\r\n");
    if (headerEnd < 0) {
      throw new Error("Multipart part headers were incomplete.");
    }

    const headers = parseHeaders(section.slice(0, headerEnd));
    const content = section.slice(headerEnd + 4);

    const disposition = headers["content-disposition"];
    if (!disposition) {
      throw new Error("Multipart part is missing Content-Disposition.");
    }

    const fieldName = readDispositionAttribute(disposition, "name");
    if (!fieldName) {
      throw new Error("Multipart part is missing a field name.");
    }

    const filename = readDispositionAttribute(disposition, "filename");
    if (filename) {
      files.push(
        createTransportFile(
          fieldName,
          filename,
          headers["content-type"] ?? "application/octet-stream",
          toUint8Array(Buffer.from(content, "latin1"))
        )
      );
    } else {
      appendBodyField(
        fields,
        fieldName,
        Buffer.from(content, "latin1").toString("utf-8")
      );
    }
  }

  return {
    body: Object.keys(fields).length > 0 ? fields : undefined,
    files
  };
}

function parseHeaders(rawHeaders: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of rawHeaders.split("\r\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) {
      continue;
    }

    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (name.length > 0) {
      headers[name] = value;
    }
  }

  return headers;
}

function readDispositionAttribute(
  disposition: string,
  name: string
): string | undefined {
  const parts = disposition.split(";");
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]!.trim();
    const separator = part.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = part.slice(0, separator).trim().toLowerCase();
    if (key !== name.toLowerCase()) {
      continue;
    }

    return stripOptionalQuotes(part.slice(separator + 1).trim());
  }

  return undefined;
}

function createTransportFile(
  fieldname: string,
  originalname: string,
  mimetype: string,
  content: Uint8Array
): TransportFile {
  return new MemoryTransportFile(fieldname, originalname, mimetype, content);
}

function appendBodyField(
  target: Record<string, unknown>,
  key: string,
  value: string
): void {
  const current = target[key];
  if (current === undefined) {
    target[key] = value;
    return;
  }

  if (Array.isArray(current)) {
    const list = current as string[];
    list.push(value);
    return;
  }

  target[key] = [String(current), value];
}

function findAllowRule(
  allowList: readonly MultipartField[],
  fieldname: string
): MultipartField | undefined {
  for (let index = 0; index < allowList.length; index += 1) {
    const candidate = allowList[index]!;
    if (candidate.name.toLowerCase() === fieldname.toLowerCase()) {
      return candidate;
    }
  }

  return undefined;
}

function readBoundary(contentType: string): string | undefined {
  const parts = contentType.split(";");
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]!.trim();
    const separator = part.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    if (part.slice(0, separator).trim().toLowerCase() !== "boundary") {
      continue;
    }

    return stripOptionalQuotes(part.slice(separator + 1).trim());
  }

  return undefined;
}

function readMultipartBytes(req: Request): Uint8Array {
  if (req.transport.bodyBytes !== undefined) {
    return req.transport.bodyBytes;
  }

  if (req.transport.bodyText !== undefined) {
    return toUint8Array(Buffer.from(req.transport.bodyText, "utf-8"));
  }

  return new Uint8Array(0);
}

function toUint8Array(buffer: Buffer): Uint8Array {
  const bytes = new Uint8Array(buffer.length);
  for (let index = 0; index < buffer.length; index += 1) {
    bytes[index] = buffer.readUInt8(index);
  }
  return bytes;
}

function stripOptionalQuotes(value: string): string {
  if (value.length >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
    return value.slice(1, value.length - 1);
  }

  return value;
}
