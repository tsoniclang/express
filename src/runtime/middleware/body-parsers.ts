import type { JsValue } from "@tsonic/core/types.js";
import { Buffer } from "node:buffer";
import type {
  JsonOptions,
  RawOptions,
  TextOptions,
  UrlEncodedOptions
} from "../options.js";
import { decodePercentEncoded } from "../percent-decoding.js";
import type { NextFunction, RequestHandler } from "../types.js";
import type { Request } from "../request.js";
import type { Response } from "../response.js";

export function createJsonMiddleware(options?: JsonOptions): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!matchesType(req, options?.type, "application/json")) {
      await next(undefined);
      return undefined;
    }

    const body = readBodyText(req);
    if (body.trim().length === 0) {
      req.body = null;
      await next(undefined);
      return undefined;
    }

    const bytes = readBodyBytes(req);
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

    const bytes = readBodyBytes(req);
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

    const bytes = readBodyBytes(req);
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

    const bytes = readBodyBytes(req);
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

function parseUrlEncoded(body: string): Record<string, JsValue> {
  const result: Record<string, JsValue> = {};
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
    const value = decodeFormComponent(rawValue);
    appendBodyField(result, key, value);
  }

  return result;
}

function appendBodyField(
  target: Record<string, JsValue>,
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

export function readBodyBytes(req: Request): Uint8Array {
  const rawBytes = req.transport.bodyBytes;
  if (rawBytes !== undefined) {
    return rawBytes;
  }

  const rawText = req.transport.bodyText;
  if (rawText !== undefined) {
    return toUint8Array(Buffer.from(rawText, "utf-8"));
  }

  return new Uint8Array(0);
}

function readBodyText(req: Request): string {
  if (req.transport.bodyText !== undefined) {
    return req.transport.bodyText;
  }

  return bytesToText(readBodyBytes(req));
}

function bytesToText(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("utf-8");
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


function toUint8Array(buffer: Buffer): Uint8Array {
  const bytes = new Uint8Array(buffer.length);
  for (let index = 0; index < buffer.length; index += 1) {
    bytes[index] = buffer.readUInt8(index);
  }
  return bytes;
}
