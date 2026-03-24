import { Buffer } from "node:buffer";
import type { Application } from "./application.js";
import { Params } from "./params.js";
import type { UploadedFile } from "./request-uploaded-file.js";
import { Cookies } from "./request-cookies.js";
import { Files } from "./request-files.js";
import type { Route } from "./route.js";
import type { Response } from "./response.js";
import type { TransportRequest } from "./types.js";

export class Request {
  readonly #transport: TransportRequest;
  readonly #headers: Record<string, string> = {};

  app?: Application;
  baseUrl: string = "";
  body: unknown = undefined;
  readonly cookies: Cookies = new Cookies();
  file?: UploadedFile;
  readonly files: Files = new Files();
  method: string = "GET";
  originalUrl: string = "/";
  readonly params: Params = new Params();
  path: string = "/";
  query: Record<string, unknown> = {};
  res?: Response;
  route?: Route;
  signed: boolean = false;
  readonly signedCookies: Cookies = new Cookies();

  constructor(transport: TransportRequest, app?: Application) {
    this.#transport = transport;
    this.app = app;
    this.method = transport.method;
    this.path = transport.path;
    this.originalUrl = transport.path;
    this.query = transport.query ?? {};

    const headers = transport.headers ?? {};
    for (const key in headers) {
      this.#headers[key.toLowerCase()] = headers[key]!;
    }

    const rawCookies = readHeader(this.#headers, "cookie");
    if (rawCookies) {
      populateCookies(this.cookies, rawCookies);
    }
  }

  get transport(): TransportRequest {
    return this.#transport;
  }

  get(name: string): string | undefined {
    return readHeader(this.#headers, name.toLowerCase());
  }

  header(name: string): string | undefined {
    return this.get(name);
  }

  param(name: string): string | undefined {
    return this.params.get(name);
  }

  setParam(name: string, value: unknown): void {
    this.params.set(name, value);
  }

  entries(): [string, string][] {
    return this.params.entries();
  }
}

function readHeader(
  headers: Record<string, string>,
  name: string
): string | undefined {
  for (const currentKey in headers) {
    if (currentKey === name) {
      return headers[currentKey];
    }
  }

  return undefined;
}

function populateCookies(store: Cookies, headerValue: string): void {
  for (const segment of headerValue.split(";")) {
    const trimmed = segment.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    if (key.length === 0) {
      continue;
    }

    const rawValue = trimmed.slice(separator + 1).trim();
    store.set(key, decodeCookieValue(rawValue));
  }
}

function decodeCookieValue(value: string): string {
  try {
    return decodePercentEncoded(value);
  } catch {
    return value;
  }
}

function decodePercentEncoded(value: string): string {
  if (!value.includes("%")) {
    return value;
  }

  const bytes: number[] = [];
  let index = 0;
  while (index < value.length) {
    const current = value[index]!;
    if (current === "%" && index + 2 < value.length) {
      const high = value[index + 1]!;
      const low = value[index + 2]!;
      if (isHexDigit(high) && isHexDigit(low)) {
        const decoded = hexDigitValue(high) * 16 + hexDigitValue(low);
        bytes.push(decoded);
        index += 3;
        continue;
      }
    }

    const chunk = Buffer.from(current, "utf-8");
    appendBufferBytes(bytes, chunk);
    index += 1;
  }

  return Buffer.from(bytes).toString("utf-8");
}

function isHexDigit(value: string): boolean {
  return (
    (value >= "0" && value <= "9") ||
    (value.toLowerCase() >= "a" && value.toLowerCase() <= "f")
  );
}

function hexDigitValue(value: string): number {
  switch (value) {
    case "0":
      return 0;
    case "1":
      return 1;
    case "2":
      return 2;
    case "3":
      return 3;
    case "4":
      return 4;
    case "5":
      return 5;
    case "6":
      return 6;
    case "7":
      return 7;
    case "8":
      return 8;
    case "9":
      return 9;
    case "a":
    case "A":
      return 10;
    case "b":
    case "B":
      return 11;
    case "c":
    case "C":
      return 12;
    case "d":
    case "D":
      return 13;
    case "e":
    case "E":
      return 14;
    case "f":
    case "F":
      return 15;
    default:
      throw new Error(`Invalid hexadecimal digit '${value}'.`);
  }
}

function appendBufferBytes(target: number[], buffer: Buffer): void {
  for (let byteIndex = 0; byteIndex < buffer.length; byteIndex += 1) {
    target.push(buffer.readUInt8(byteIndex));
  }
}
