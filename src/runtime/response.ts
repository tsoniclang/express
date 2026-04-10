import { overloads as O } from "@tsonic/core/lang.js";
import type { JsValue } from "@tsonic/core/types.js";
import { basename, extname, isAbsolute, resolve, sep } from "node:path";
import { existsSync, readFileSync, statSync, type Stats } from "node:fs";
import type { Application } from "./application.js";
import type {
  DownloadOptions,
  FileTransferOptions,
  SendFileOptions,
} from "./options.js";
import { sign } from "./response-cookie-signature.js";
import type { Request } from "./request.js";
import type { TemplateCallback, TransportResponse } from "./types.js";

export interface CookieOptions {
  encode?: (value: string) => string;
  expires?: Date;
  path?: string;
  domain?: string;
  httpOnly?: boolean;
  secure?: boolean;
  partitioned?: boolean;
  sameSite?: string | boolean;
  priority?: string;
  maxAge?: number;
  signed?: boolean;
}

export type FormatHandler = (
  req: Request,
  res: Response,
  next: () => void
) => void;

export type FormatHandlers = Record<string, FormatHandler>;

export type SendFileCallback = (error: Error | null) => void;

class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class Response {
  readonly #transport: TransportResponse;
  readonly #headers: Record<string, string> = {};
  #statusCode: number = 200;

  req?: Request;
  readonly locals: Record<string, JsValue> = {};
  headersSent: boolean = false;

  constructor(transport: TransportResponse, request?: Request) {
    this.#transport = transport;
    this.req = request;
    if (request) {
      request.res = this;
    }
    this.#statusCode = transport.statusCode;
  }

  get app(): Application | undefined {
    return this.req?.app;
  }

  get statusCode(): number {
    return this.#statusCode;
  }

  set statusCode(value: number) {
    this.#statusCode = value;
    this.#transport.statusCode = value;
  }

  append(field: string, value: string): this;
  append(field: string, value: string[]): this;
  append(field: string, value: string | string[]): this {
    if (Array.isArray(value)) {
      return this.append_many(field, value);
    }

    return this.append_one(field, value);
  }

  append_one(field: string, value: string): this {
    return this.appendValue(field, value);
  }

  append_many(field: string, value: string[]): this {
    for (let index = 0; index < value.length; index += 1) {
      const item = value[index]!;
      this.append(field, item);
    }

    return this;
  }

  cookie(name: string, value: JsValue, options?: CookieOptions): this {
    let payload = typeof value === "string" ? value : JSON.stringify(value);
    if (options?.signed) {
      const secret =
        typeof this.app?.get("cookie secret") === "string"
          ? String(this.app?.get("cookie secret"))
          : undefined;
      if (!secret) {
        throw new Error(
          "Cannot set signed cookie without a secret. Install cookieParser() first."
        );
      }

      payload = sign(payload, secret);
    }

    const encoded = options?.encode ? options.encode(payload) : payload;
    const segments = [`${name}=${encoded}`, `Path=${options?.path ?? "/"}`];

    if (options?.domain) {
      segments.push(`Domain=${options.domain}`);
    }

    if (typeof options?.maxAge === "number") {
      let maxAgeSeconds = options.maxAge - (options.maxAge % 1000);
      if (maxAgeSeconds < 0) {
        maxAgeSeconds = 0;
      }
      segments.push(`Max-Age=${String(maxAgeSeconds / 1000)}`);
    }

    if (options?.expires) {
      segments.push(`Expires=${options.expires.toUTCString()}`);
    }

    if (options?.httpOnly) {
      segments.push("HttpOnly");
    }

    if (options?.partitioned) {
      segments.push("Partitioned");
    }

    if (options?.secure) {
      segments.push("Secure");
    }

    if (typeof options?.sameSite === "string" && options.sameSite.length > 0) {
      segments.push(`SameSite=${options.sameSite}`);
    } else if (options?.sameSite === true) {
      segments.push("SameSite=Strict");
    }

    if (options?.priority) {
      segments.push(`Priority=${options.priority}`);
    }

    return this.append("Set-Cookie", segments.join("; "));
  }

  clearCookie(name: string, options?: CookieOptions): this {
    return this.cookie(name, "", {
      ...options,
      expires: new Date(0),
      maxAge: 0
    });
  }

  get(field: string): string | undefined {
    return (
      readHeader(this.#headers, field.toLowerCase()) ??
      this.#transport.getHeader(field)
    );
  }

  header(field: string, value: JsValue): this {
    return this.set(field, value);
  }

  json(body?: JsValue): this {
    this.type("application/json");
    return this.send(typeof body === "string" ? body : JSON.stringify(body ?? null));
  }

  jsonp(body?: JsValue): this {
    const callbackName = typeof this.app?.get("jsonp callback name") === "string"
      ? String(this.app?.get("jsonp callback name"))
      : "callback";
    const payload = typeof body === "string" ? body : JSON.stringify(body ?? null);
    this.type("application/javascript");
    return this.send(`${callbackName}(${payload})`);
  }

  render(view: string, locals?: Record<string, JsValue>, callback?: TemplateCallback): this {
    const engine = this.app?.resolveEngine(view);
    const viewLocals = locals ?? this.locals;

    if (!engine) {
      const html = `<rendered:${view}>`;
      if (callback) {
        callback(null, html);
        return this;
      }

      return this.send(html);
    }

    if (callback) {
      engine(view, viewLocals, callback);
      return this;
    }

    engine(view, viewLocals, (_error, html) => {
      this.send(html ?? "");
    });
    return this;
  }

  attachment(filename?: string): this {
    if (filename) {
      const safeName = basename(filename);
      this.type(lookupMimeType(safeName));
      return this.set(
        "Content-Disposition",
        `attachment; filename=\"${safeName.replaceAll("\"", "\\\"")}"`
      );
    }

    return this.set("Content-Disposition", "attachment");
  }

  download(path: string): this;
  download(path: string, callback: SendFileCallback): this;
  download(path: string, filename: string): this;
  download(path: string, filename: string, callback: SendFileCallback): this;
  download(path: string, options: DownloadOptions): this;
  download(path: string, options: DownloadOptions, callback: SendFileCallback): this;
  download(
    path: string,
    filename: string,
    options: DownloadOptions
  ): this;
  download(
    path: string,
    filename: string,
    options: DownloadOptions,
    callback: SendFileCallback
  ): this;
  download(...args: any[]): any {
    if (args.length === 1) {
      return this.download_path(args[0]);
    }

    if (args.length === 2) {
      if (typeof args[1] === "function") {
        return this.download_path_callback(args[0], args[1]);
      }
      if (typeof args[1] === "string") {
        return this.download_path_filename(args[0], args[1]);
      }
      return this.download_path_options(args[0], args[1]);
    }

    if (args.length === 3) {
      if (typeof args[1] === "string") {
        if (typeof args[2] === "function") {
          return this.download_path_filename_callback(args[0], args[1], args[2]);
        }
        return this.download_path_filename_options(args[0], args[1], args[2]);
      }
      return this.download_path_options_callback(args[0], args[1], args[2]);
    }

    return this.download_path_filename_options_callback(
      args[0],
      args[1],
      args[2],
      args[3]
    );
  }

  download_path(path: string): this {
    this.attachment(path);
    return this.sendFile_impl(path);
  }

  download_path_callback(path: string, callback: SendFileCallback): this {
    this.attachment(path);
    return this.sendFile_impl(path, undefined, callback);
  }

  download_path_filename(path: string, filename: string): this {
    this.attachment(filename);
    return this.sendFile_impl(path);
  }

  download_path_filename_callback(
    path: string,
    filename: string,
    callback: SendFileCallback
  ): this {
    this.attachment(filename);
    return this.sendFile_impl(path, undefined, callback);
  }

  download_path_options(path: string, options: DownloadOptions): this {
    this.attachment(path);
    return this.sendFile_impl(path, options);
  }

  download_path_options_callback(
    path: string,
    options: DownloadOptions,
    callback: SendFileCallback
  ): this {
    this.attachment(path);
    return this.sendFile_impl(path, options, callback);
  }

  download_path_filename_options(
    path: string,
    filename: string,
    options: DownloadOptions
  ): this {
    this.attachment(filename);
    return this.sendFile_impl(path, options);
  }

  download_path_filename_options_callback(
    path: string,
    filename: string,
    options: DownloadOptions,
    callback: SendFileCallback
  ): this {
    this.attachment(filename);
    return this.sendFile_impl(path, options, callback);
  }

  end(body?: JsValue): this {
    return this.send(body);
  }

  format(handlers: FormatHandlers): this {
    this.vary("Accept");
    const req = this.req;
    if (!req) {
      return this.status(500).send("Response.format requires an attached request.");
    }

    const keys = Object.keys(handlers).filter((key) => key !== "default");
    const next = (): void => {};
    let selectedType = "";
    if (keys.length > 0) {
      const accepted = req.accepts(keys);
      if (accepted !== false) {
        selectedType = accepted;
      }
    }

    if (selectedType.length > 0) {
      const selectedHandler = handlers[selectedType];
      if (!selectedHandler) {
        return this.status(406).send("Not Acceptable");
      }

      this.type(normalizeFormatType(selectedType));
      selectedHandler(req, this, next);
      return this;
    }

    const defaultHandler = handlers["default"];
    if (defaultHandler) {
      defaultHandler(req, this, next);
      return this;
    }

    return this.status(406).send("Not Acceptable");
  }

  links(links: Record<string, string>): this {
    const entries = Object.entries(links).map(
      ([rel, url]) => `<${url}>; rel=\"${rel}\"`
    );
    return this.set("Link", entries.join(", "));
  }

  location(path: string): this {
    return this.set("Location", path);
  }

  redirect(path: string): this;
  redirect(status: number, path: string): this;
  redirect(statusOrPath: any, maybePath?: any): any {
    if (typeof statusOrPath === "number") {
      return this.redirect_status(statusOrPath, maybePath);
    }

    return this.redirect_path(statusOrPath);
  }

  redirect_path(path: string): this {
    return this.redirect_status(302, path);
  }

  redirect_status(status: number, path: string): this {
    this.location(path);
    this.status(status);
    return this.send(`Redirecting to ${path}`);
  }

  send(body?: JsValue): this {
    this.#transport.statusCode = this.#statusCode;

    const contentType = this.get("content-type");
    if (body == null) {
      void this.#transport.sendText("");
    } else if (body instanceof Uint8Array) {
      if (!contentType) {
        this.type("application/octet-stream");
      }
      void this.#transport.sendBytes(body);
    } else if (typeof body === "string") {
      void this.#transport.sendText(body);
    } else {
      if (!contentType) {
        this.type("application/json");
      }
      void this.#transport.sendText(JSON.stringify(body));
    }

    this.headersSent = true;
    return this;
  }

  sendStatus(code: number): this {
    return this.status(code).send(String(code));
  }

  sendFile(path: string): this;
  sendFile(path: string, callback: SendFileCallback): this;
  sendFile(path: string, options: SendFileOptions): this;
  sendFile(path: string, options: SendFileOptions, callback: SendFileCallback): this;
  sendFile(...args: any[]): any {
    if (args.length === 1) {
      return this.sendFile_path(args[0]);
    }

    if (args.length === 2) {
      if (typeof args[1] === "function") {
        return this.sendFile_path_callback(args[0], args[1]);
      }
      return this.sendFile_path_options(args[0], args[1]);
    }

    return this.sendFile_path_options_callback(args[0], args[1], args[2]);
  }

  sendFile_path(path: string): this {
    return this.sendFile_impl(path);
  }

  sendFile_path_callback(path: string, callback: SendFileCallback): this {
    return this.sendFile_impl(path, undefined, callback);
  }

  sendFile_path_options(
    path: string,
    options: SendFileOptions
  ): this {
    return this.sendFile_impl(path, options);
  }

  sendFile_path_options_callback(
    path: string,
    options: SendFileOptions,
    callback: SendFileCallback
  ): this {
    return this.sendFile_impl(path, options, callback);
  }

  private sendFile_impl(
    path: string,
    options?: FileTransferOptions,
    callback?: SendFileCallback
  ): this {
    try {
      const filePath = resolveSendFilePath(path, options?.root);
      const fileName = basename(filePath);
      if (fileName.startsWith(".") && options?.dotfiles !== "allow") {
        throw createHttpError(
          options?.dotfiles === "deny" ? 403 : 404,
          options?.dotfiles === "deny" ? "Forbidden" : "Not Found"
        );
      }

      if (!existsSync(filePath)) {
        throw createHttpError(404, "Not Found");
      }

      const stats: Stats = statSync(filePath);

      if (options?.headers) {
        for (const key in options.headers) {
          this.set(key, options.headers[key]!);
        }
      }

      if (options?.lastModified !== false) {
        this.set("Last-Modified", stats.mtime.toUTCString());
      }

      if (options?.acceptRanges !== false) {
        this.set("Accept-Ranges", "bytes");
      }

      applyCacheHeaders(this, options);

      if (options?.headers?.["content-type"] === undefined && !this.get("content-type")) {
        this.type(lookupMimeType(fileName));
      }

      const bytes = new Uint8Array(readFileSync(filePath));
      this.send(bytes);
      if (callback) {
        callback(null);
      }
    } catch (error) {
      const resolved = error instanceof Error ? error : new Error("sendFile failed");
      if (callback) {
        callback(resolved);
        return this;
      }

      const statusCode = readHttpStatusCode(resolved);
      return this.status(statusCode).send(resolved.message);
    }

    return this;
  }

  set(field: string, value: JsValue): this;
  set(fields: Record<string, JsValue>): this;
  set(fieldOrFields: string | Record<string, JsValue>, value?: JsValue): this {
    if (typeof fieldOrFields === "string") {
      return this.set_one(fieldOrFields, value);
    }

    return this.set_many(fieldOrFields);
  }

  set_one(field: string, value: JsValue = ""): this {
    const rendered = value == null ? "" : String(value);
    this.#headers[field.toLowerCase()] = rendered;
    this.#transport.setHeader(field, rendered);
    return this;
  }

  set_many(fields: Record<string, JsValue>): this {
    const keys = Object.keys(fields);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index]!;
      this.set_one(key, fields[key]);
    }
    return this;
  }

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  type(typeName: string): this {
    return this.set("Content-Type", typeName);
  }

  contentType(typeName: string): this {
    return this.type(typeName);
  }

  vary(field: string): this {
    const current = this.get("vary");
    if (!current) {
      return this.set("Vary", field);
    }

    const entries = current.split(",");
    for (let index = 0; index < entries.length; index += 1) {
      if (entries[index]!.trim().toLowerCase() === field.toLowerCase()) {
        return this;
      }
    }

    return this.set("Vary", `${current}, ${field}`);
  }

  private appendValue(field: string, value: string): this {
    const key = field.toLowerCase();
    const current = readHeader(this.#headers, key);
    const next = current ? `${current}, ${value}` : value;
    this.#headers[key] = next;
    this.#transport.appendHeader(field, value);
    return this;
  }
}

O<Response>().method(x => x.append_one).family(x => x.append);
O<Response>().method(x => x.append_many).family(x => x.append);
O<Response>().method(x => x.download_path).family(x => x.download);
O<Response>().method(x => x.download_path_callback).family(x => x.download);
O<Response>().method(x => x.download_path_filename).family(x => x.download);
O<Response>().method(x => x.download_path_filename_callback).family(x => x.download);
O<Response>().method(x => x.download_path_options).family(x => x.download);
O<Response>().method(x => x.download_path_options_callback).family(x => x.download);
O<Response>().method(x => x.download_path_filename_options).family(x => x.download);
O<Response>().method(x => x.download_path_filename_options_callback).family(x => x.download);
O<Response>().method(x => x.redirect_path).family(x => x.redirect);
O<Response>().method(x => x.set_one).family(x => x.set);
O<Response>().method(x => x.set_many).family(x => x.set);
O<Response>().method(x => x.redirect_status).family(x => x.redirect);
O<Response>().method(x => x.sendFile_path).family(x => x.sendFile);
O<Response>().method(x => x.sendFile_path_callback).family(x => x.sendFile);
O<Response>().method(x => x.sendFile_path_options).family(x => x.sendFile);
O<Response>().method(x => x.sendFile_path_options_callback).family(x => x.sendFile);

function readHeader(
  headers: Record<string, string>,
  field: string
): string | undefined {
  for (const currentKey in headers) {
    if (currentKey === field) {
      return headers[currentKey];
    }
  }

  return undefined;
}

function resolveDownloadArgs(
  filenameOrOptionsOrCallback: string | DownloadOptions | SendFileCallback | undefined,
  optionsOrCallback: DownloadOptions | SendFileCallback | undefined,
  maybeCallback: SendFileCallback | undefined
): {
  filename: string | undefined;
  options: DownloadOptions | undefined;
  callback: SendFileCallback | undefined;
} {
  let filename: string | undefined;
  let options: DownloadOptions | undefined;
  let callback: SendFileCallback | undefined;

  if (typeof filenameOrOptionsOrCallback === "string") {
    filename = filenameOrOptionsOrCallback;
  } else if (typeof filenameOrOptionsOrCallback === "function") {
    callback = filenameOrOptionsOrCallback;
  } else {
    options = filenameOrOptionsOrCallback;
  }

  if (typeof optionsOrCallback === "function") {
    callback = optionsOrCallback;
  } else if (optionsOrCallback) {
    options = optionsOrCallback;
  }

  if (maybeCallback) {
    callback = maybeCallback;
  }

  return { filename, options, callback };
}

function resolveSendFilePath(path: string, root?: string): string {
  if (!root) {
    return resolve(path);
  }

  const resolvedRoot = resolve(root);
  const candidate = isAbsolute(path) ? resolve(path) : resolve(resolvedRoot, path);
  if (candidate !== resolvedRoot && !candidate.startsWith(`${resolvedRoot}${sep}`)) {
    throw createHttpError(403, "Forbidden");
  }

  return candidate;
}

function applyCacheHeaders(
  response: Response,
  options: FileTransferOptions | undefined
): void {
  if (options?.cacheControl === false) {
    return;
  }

  const maxAge = normalizeMaxAge(options?.maxAge);
  let value = maxAge > 0 ? `public, max-age=${maxAge}` : "public, max-age=0";
  if (options?.immutable) {
    value += ", immutable";
  }
  response.set("Cache-Control", value);
}

function normalizeMaxAge(value: number | string | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value / 1000));
  }

  if (typeof value !== "string") {
    return 0;
  }

  const trimmed = value.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) {
    return Math.max(0, Number(trimmed));
  }

  const match = /^(\d+)(ms|s|m|h|d)$/.exec(trimmed);
  if (!match) {
    return 0;
  }

  const amount = Number(match[1]);
  switch (match[2]) {
    case "ms":
      return Math.max(0, Math.floor(amount / 1000));
    case "s":
      return amount;
    case "m":
      return amount * 60;
    case "h":
      return amount * 60 * 60;
    case "d":
      return amount * 60 * 60 * 24;
    default:
      return 0;
  }
}

function lookupMimeType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".html":
    case ".htm":
      return "text/html";
    case ".json":
      return "application/json";
    case ".txt":
      return "text/plain";
    case ".js":
      return "application/javascript";
    case ".css":
      return "text/css";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

function normalizeFormatType(value: string): string {
  switch (value.toLowerCase()) {
    case "html":
      return "text/html";
    case "json":
      return "application/json";
    case "text":
      return "text/plain";
    default:
      return value;
  }
}

function createHttpError(statusCode: number, message: string): Error {
  return new HttpError(statusCode, message);
}

function readHttpStatusCode(error: Error): number {
  return error instanceof HttpError ? error.statusCode : 500;
}
