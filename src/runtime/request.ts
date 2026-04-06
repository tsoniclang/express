import type { JsValue } from "@tsonic/core/types.js";
import type { Application } from "./application.js";
import { Params } from "./params.js";
import { decodePercentEncoded } from "./percent-decoding.js";
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
  body: JsValue | undefined = undefined;
  readonly cookies: Cookies = new Cookies();
  file?: UploadedFile;
  readonly files: Files = new Files();
  method: string = "GET";
  originalUrl: string = "/";
  readonly params: Params = new Params();
  path: string = "/";
  query: Record<string, JsValue> = {};
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

  setParam(name: string, value: JsValue): void {
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
