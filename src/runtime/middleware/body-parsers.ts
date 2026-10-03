import type { Buffer } from "node:buffer";
import type { BufferByteLength } from "../byte-counts.js";
import type {
  JsonOptions,
  RawOptions,
  TextOptions,
  UrlEncodedOptions
} from "../options.js";
import { decodePercentEncoded } from "../percent-decoding.js";
import { requireSafeRecordKey } from "../safe-record-key.js";
import type { NextFunction, RequestHandler } from "../types.js";
import type { Request } from "../request.js";
import type { Response } from "../response.js";
import { readBoundedBody } from "./bounded-body.js";

export function createJsonMiddleware(options?: JsonOptions): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!matchesType(req, options?.type, "application/json")) {
      await next(undefined);
      return undefined;
    }

    const bytes = await readBodyBytes(req, options?.limit, options?.inflate);
    const body = bytesToText(bytes);
    if (body.trim().length === 0) {
      req.body = null;
      await next(undefined);
      return undefined;
    }

    options?.verify?.(req, res, bytes, "utf-8");
    req.body = JSON.parse(body);
    await next(undefined);
    return undefined;
  };
}

export function createRawMiddleware(options?: RawOptions): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!matchesType(req, options?.type, "application/octet-stream")) {
      await next(undefined);
      return undefined;
    }

    const bytes = await readBodyBytes(req, options?.limit, options?.inflate);
    options?.verify?.(req, res, bytes, undefined);
    req.body = bytes;
    await next(undefined);
    return undefined;
  };
}

export function createTextMiddleware(options?: TextOptions): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!matchesType(req, options?.type, "text/plain")) {
      await next(undefined);
      return undefined;
    }

    const bytes = await readBodyBytes(req, options?.limit, options?.inflate);
    options?.verify?.(req, res, bytes, "utf-8");
    req.body = bytesToText(bytes);
    await next(undefined);
    return undefined;
  };
}

export function createUrlEncodedMiddleware(
  options?: UrlEncodedOptions
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (
      !matchesType(req, options?.type, "application/x-www-form-urlencoded")
    ) {
      await next(undefined);
      return undefined;
    }

    const bytes = await readBodyBytes(req, options?.limit, options?.inflate);
    options?.verify?.(req, res, bytes, "utf-8");
    req.body = parseUrlEncoded(bytesToText(bytes));
    await next(undefined);
    return undefined;
  };
}

function matchesType(
  req: Request,
  configuredType: string | string[] | undefined,
  defaultType: string
): boolean {
  const contentType = req.get("content-type") ?? "";
  if (contentType.trim().length === 0) {
    return false;
  }

  if (configuredType === undefined) {
    return contentType.toLowerCase().includes(defaultType.toLowerCase());
  }

  if (Array.isArray(configuredType)) {
    for (let index = 0; index < configuredType.length; index += 1) {
      const item = configuredType[index]!;
      if (contentType.toLowerCase().includes(item.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  return contentType.toLowerCase().includes(configuredType.toLowerCase());
}

function parseUrlEncoded(body: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (body.length === 0) {
    return result;
  }

  for (const pair of body.split("&")) {
    if (pair.length === 0) {
      continue;
    }

    const separator = pair.indexOf("=");
    const rawKey = separator >= 0 ? pair.slice(0, separator) : pair;
    const rawValue = separator >= 0 ? pair.slice(separator + 1) : "";
    const key = decodeFormComponent(rawKey);
    requireSafeRecordKey(key);
    const value = decodeFormComponent(rawValue);
    appendBodyField(result, key, value);
  }

  return result;
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

function decodeFormComponent(value: string): string {
  try {
    return decodePercentEncoded(replacePluses(value));
  } catch {
    return value;
  }
}

export async function readBodyBytes(
  req: Request,
  limit?: string | BufferByteLength,
  inflate: boolean = true
): Promise<Buffer> {
  return await readBoundedBody(req, parseBodyLimit(limit), inflate);
}

function bytesToText(bytes: Buffer): string {
  return bytes.toString("utf-8");
}

function parseBodyLimit(limit: string | BufferByteLength | undefined): BufferByteLength {
  if (limit === undefined) {
    return 100 * 1024;
  }

  if (typeof limit === "number") {
    return validateBodyLimit(limit);
  }

  const normalized = limit.trim().toLowerCase();
  if (normalized.length === 0) {
    throw new Error("Invalid body size limit");
  }

  const match = /^([0-9]+(?:\.[0-9]+)?)\s*(b|kb|k|mb|m|gb|g)?$/.exec(normalized);
  if (match === null) {
    throw new Error("Invalid body size limit");
  }

  const rawValue = Number(match[1]);
  const suffix = match[2] ?? "b";
  let multiplier = 1;
  if (suffix === "kb" || suffix === "k") {
    multiplier = 1024;
  } else if (suffix === "mb" || suffix === "m") {
    multiplier = 1024 * 1024;
  } else if (suffix === "gb" || suffix === "g") {
    multiplier = 1024 * 1024 * 1024;
  }

  return validateBodyLimit(Math.floor(rawValue * multiplier)) as BufferByteLength;
}

function validateBodyLimit<Length extends number>(limit: Length): Length {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error("Invalid body size limit");
  }
  return limit;
}

function replacePluses(value: string): string {
  if (!value.includes("+")) {
    return value;
  }

  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    result += value[index] === "+" ? " " : value[index]!;
  }
  return result;
}
