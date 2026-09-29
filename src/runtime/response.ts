import { Buffer } from "node:buffer";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { Readable, type Transform } from "node:stream";
import { createBrotliCompress, createDeflate, createGzip } from "node:zlib";
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

export type JsonRecord = Record<string, unknown>;

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
  #completion: Promise<void> = Promise.resolve(undefined);
  #compression: "br" | "gzip" | "deflate" | undefined;

  req?: Request;
  readonly locals: Record<string, unknown> = {};
  headersSent: boolean = false;

  constructor(transport: TransportResponse, request?: Request) {
    this.#transport = transport;
    this.req = request;
    if (request !== undefined) {
      request.res = this;
    }
    this.#statusCode = transport.statusCode;
  }

  get app(): Application | undefined {
    return this.req?.app;
  }

  get completion(): Promise<void> {
    return this.#completion;
  }

  enableCompression(encoding: "br" | "gzip" | "deflate"): void {
    this.#compression = encoding;
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
    if (Array.isArray(value) === true) {
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

  cookie(name: string, value: JsonRecord, options?: CookieOptions): this;
  cookie(name: string, value: unknown, options?: CookieOptions): this;
  cookie(name: string, value: unknown, options?: CookieOptions): this {
    return this.cookie_value(name, value, options);
  }

  cookie_record(name: string, value: JsonRecord, options?: CookieOptions): this {
    return this.writeCookie(name, value, options);
  }

  cookie_value(name: string, value: unknown, options?: CookieOptions): this {
    return this.writeCookie(name, value, options);
  }

  private writeCookie(name: string, value: unknown, options?: CookieOptions): this {
    let payload = stringifyResponseJsonValue(value);
    if (options !== undefined && options.signed === true) {
      const configuredSecret = this.app?.get("cookie secret");
      let secret: string | undefined;
      if (typeof configuredSecret === "string") {
        secret = configuredSecret;
      }
      if (secret === undefined || secret.length === 0) {
        throw new Error(
          "Cannot set signed cookie without a secret. Install cookieParser() first."
        );
      }

      payload = sign(payload, secret);
    }

    let encode: ((value: string) => string) | undefined;
    let path = "/";
    let domain: string | undefined;
    let maxAge: number | undefined;
    let expires: Date | undefined;
    let sameSite: string | boolean | undefined;
    let priority: string | undefined;
    if (options !== undefined) {
      encode = options.encode;
      if (options.path !== undefined) {
        path = options.path;
      }
      domain = options.domain;
      maxAge = options.maxAge;
      expires = options.expires;
      sameSite = options.sameSite;
      priority = options.priority;
    }

    const encoded = encode ? encode(payload) : payload;
    const segments = [`${name}=${encoded}`, `Path=${path}`];

    if (domain !== undefined && domain.length > 0) {
      segments.push(`Domain=${domain}`);
    }

    if (maxAge !== undefined) {
      let maxAgeSeconds = maxAge - (maxAge % 1000);
      if (maxAgeSeconds < 0) {
        maxAgeSeconds = 0;
      }
      segments.push(`Max-Age=${String(maxAgeSeconds / 1000)}`);
    }

    if (expires !== undefined) {
      segments.push(`Expires=${expires.toUTCString()}`);
    }

    if (options !== undefined && options.httpOnly === true) {
      segments.push("HttpOnly");
    }

    if (options !== undefined && options.partitioned === true) {
      segments.push("Partitioned");
    }

    if (options !== undefined && options.secure === true) {
      segments.push("Secure");
    }

    if (typeof sameSite === "string" && sameSite.length > 0) {
      segments.push(`SameSite=${sameSite}`);
    } else if (sameSite === true) {
      segments.push("SameSite=Strict");
    }

    if (priority !== undefined && priority.length > 0) {
      segments.push(`Priority=${priority}`);
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

  header(field: string, value: unknown): this {
    return this.set(field, value);
  }

  json(body: JsonRecord): this;
  json(body?: unknown): this;
  json(body?: unknown): this {
    return this.json_value(body);
  }

  json_record(body: JsonRecord): this {
    return this.writeJson(body);
  }

  json_value(body?: unknown): this {
    return this.writeJson(body);
  }

  private writeJson(body?: unknown): this {
    this.type("application/json");
    return this.send(stringifyOptionalResponseJsonValue(body));
  }

  jsonp(body: JsonRecord): this;
  jsonp(body?: unknown): this;
  jsonp(body?: unknown): this {
    return this.jsonp_value(body);
  }

  jsonp_record(body: JsonRecord): this {
    return this.writeJsonp(body);
  }

  jsonp_value(body?: unknown): this {
    return this.writeJsonp(body);
  }

  private writeJsonp(body?: unknown): this {
    const configuredCallbackName = this.app?.get("jsonp callback name");
    const callbackName =
      typeof configuredCallbackName === "string"
        ? configuredCallbackName
        : "callback";
    const payload = stringifyOptionalResponseJsonValue(body);
    this.type("application/javascript");
    return this.send(`${callbackName}(${payload})`);
  }

  render(view: string, locals?: Record<string, unknown>, callback?: TemplateCallback): this {
    const engine = this.app?.resolveEngine(view);
    const viewLocals = locals ?? this.locals;

    if (engine === undefined) {
      const html = `<rendered:${view}>`;
      if (callback !== undefined) {
        callback(null, html);
        return this;
      }

      return this.send(html);
    }

    if (callback !== undefined) {
      engine(view, viewLocals, callback);
      return this;
    }

    engine(view, viewLocals, (_error, html) => {
      this.send(html ?? "");
    });
    return this;
  }

  attachment(filename?: string): this {
    if (filename !== undefined && filename.length > 0) {
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
  download(
    path: string,
    filenameOrOptionsOrCallback?: string | DownloadOptions | SendFileCallback,
    optionsOrCallback?: DownloadOptions | SendFileCallback,
    callback?: SendFileCallback
  ): this {
    if (typeof filenameOrOptionsOrCallback === "function") {
      return this.download_path_callback(path, filenameOrOptionsOrCallback);
    }
    if (typeof filenameOrOptionsOrCallback === "string") {
      if (typeof optionsOrCallback === "function") {
        return this.download_path_filename_callback(path, filenameOrOptionsOrCallback, optionsOrCallback);
      }
      if (optionsOrCallback !== undefined) {
        return callback === undefined
          ? this.download_path_filename_options(path, filenameOrOptionsOrCallback, optionsOrCallback)
          : this.download_path_filename_options_callback(path, filenameOrOptionsOrCallback, optionsOrCallback, callback);
      }
      return this.download_path_filename(path, filenameOrOptionsOrCallback);
    }
    if (filenameOrOptionsOrCallback !== undefined) {
      return typeof optionsOrCallback === "function"
        ? this.download_path_options_callback(path, filenameOrOptionsOrCallback, optionsOrCallback)
        : this.download_path_options(path, filenameOrOptionsOrCallback);
    }
    return this.download_path(path);
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

  end(body?: unknown): this {
    return this.send(body);
  }

  format(handlers: FormatHandlers): this {
    this.vary("Accept");
    const req = this.req;
    if (req === undefined) {
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
      if (selectedHandler === undefined) {
        return this.status(406).send("Not Acceptable");
      }

      this.type(normalizeFormatType(selectedType));
      selectedHandler(req, this, next);
      return this;
    }

    const defaultHandler = handlers["default"];
    if (defaultHandler !== undefined) {
      defaultHandler(req, this, next);
      return this;
    }

    return this.status(406).send("Not Acceptable");
  }

  links(links: Record<string, string>): this {
    const entries: string[] = [];
    const keys = Object.keys(links);
    for (let index = 0; index < keys.length; index += 1) {
      const rel = keys[index]!;
      const url = links[rel]!;
      entries.push(`<${url}>; rel=\"${rel}\"`);
    }
    return this.set("Link", entries.join(", "));
  }

  location(path: string): this {
    return this.set("Location", path);
  }

  redirect(path: string): this;
  redirect(status: number, path: string): this;
  redirect(statusOrPath: string | number, maybePath?: string): this {
    if (typeof statusOrPath === "number") {
      if (maybePath === undefined) throw new Error("Redirect path is required.");
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

  send(body: JsonRecord): this;
  send(body?: unknown): this;
  send(body?: unknown): this {
    return this.send_value(body);
  }

  send_record(body: JsonRecord): this {
    return this.writeSend(body);
  }

  send_value(body?: unknown): this {
    return this.writeSend(body);
  }

  private writeSend(body?: unknown): this {
    this.#transport.statusCode = this.#statusCode;

    const contentType = this.get("content-type");
    if (body == null) {
      void this.#transport.sendText("");
    } else if (body instanceof Buffer) {
      if (contentType === undefined || contentType.length === 0) {
        this.type("application/octet-stream");
      }
      if (this.prepareCompression(body.length)) {
        this.#completion = this.pipeCompressed(Readable.from([body]));
      } else {
        this.#transport.sendBytes(body);
      }
    } else if (body instanceof Uint8Array) {
      if (contentType === undefined || contentType.length === 0) {
        this.type("application/octet-stream");
      }
      const bytes = Buffer.from(body);
      if (this.prepareCompression(bytes.length)) {
        this.#completion = this.pipeCompressed(Readable.from([bytes]));
      } else {
        this.#transport.sendBytes(bytes);
      }
    } else {
      const text = typeof body === "string" ? body : stringifyJsonValue(body);
      if (contentType === undefined || contentType.length === 0) this.type(typeof body === "string" ? "text/html; charset=utf-8" : "application/json");
      if (this.prepareCompression(Buffer.byteLength(text))) {
        this.#completion = this.pipeCompressed(Readable.from([Buffer.from(text)]));
      } else {
        this.#transport.sendText(text);
      }
    }

    this.headersSent = true;
    return this;
  }

  private prepareCompression(size: number): boolean {
    if (this.#compression === undefined || size < 1024 || this.#statusCode !== 200 ||
        this.req?.method === "HEAD" || this.get("content-encoding") !== undefined ||
        this.get("content-range") !== undefined ||
        this.get("cache-control")?.includes("no-transform") === true ||
        !isCompressibleType(this.get("content-type"))) return false;
    this.set("Content-Encoding", this.#compression);
    delete this.#headers["content-length"];
    this.#transport.removeHeader("Content-Length");
    return true;
  }

  private async pipeCompressed(source: Readable): Promise<void> {
    const codec: Transform = this.#compression === "br"
      ? createBrotliCompress()
      : this.#compression === "deflate"
        ? createDeflate()
        : createGzip();
    const onSourceError = (error: Error): void => { codec.destroy(error); };
    source.once("error", onSourceError);
    try {
      await this.#transport.pipeFrom(source.pipe(codec));
    } finally {
      source.off("error", onSourceError);
      source.destroy();
      codec.destroy();
    }
  }

  sendStatus(code: number): this {
    return this.status(code).send(String(code));
  }

  sendFile(path: string): this;
  sendFile(path: string, callback: SendFileCallback): this;
  sendFile(path: string, options: SendFileOptions): this;
  sendFile(path: string, options: SendFileOptions, callback: SendFileCallback): this;
  sendFile(path: string, optionsOrCallback?: SendFileOptions | SendFileCallback, callback?: SendFileCallback): this {
    if (typeof optionsOrCallback === "function") {
      return this.sendFile_path_callback(path, optionsOrCallback);
    }
    if (optionsOrCallback !== undefined) {
      return callback === undefined
        ? this.sendFile_path_options(path, optionsOrCallback)
        : this.sendFile_path_options_callback(path, optionsOrCallback, callback);
    }
    return this.sendFile_path(path);
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
    this.headersSent = true;
    this.#completion = this.streamFile(path, options).then(
      () => callback?.(null),
      (error) => {
        const failure = error instanceof Error ? error : new Error("sendFile failed");
        if (!this.#transport.headersSent) this.headersSent = false;
        if (callback !== undefined) {
          callback(failure);
          return;
        }
        if (!this.#transport.headersSent) {
          this.status(readHttpStatusCode(failure)).send(failure.message);
          return;
        }
        throw failure;
      }
    );
    return this;
  }

  private async streamFile(path: string, options?: FileTransferOptions): Promise<void> {
    const filePath = resolveSendFilePath(path, options?.root);
    const fileName = basename(filePath);
    const rootRelativePath = options?.root === undefined
      ? filePath
      : relative(resolve(options.root), filePath);
    if (rootRelativePath.split(sep).some((segment) => segment.startsWith(".") && segment.length > 1) &&
        options?.dotfiles !== "allow") {
      throw createHttpError(
        options?.dotfiles === "deny" ? 403 : 404,
        options?.dotfiles === "deny" ? "Forbidden" : "Not Found"
      );
    }

    const canonicalPath = await realpath(filePath);
    if (options?.root !== undefined) {
      const canonicalRoot = await realpath(options.root);
      const inside = relative(canonicalRoot, canonicalPath);
      if (inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
        throw createHttpError(403, "Forbidden");
      }
    }
    const stats = await stat(canonicalPath);
    if (!stats.isFile()) throw createHttpError(404, "Not Found");

    options?.setHeaders?.(this, canonicalPath, { size: stats.size, modifiedAt: new Date(stats.mtimeMs) });

    const etag = options?.etag === false
      ? undefined
      : `W/"${String(stats.size)}-${String(stats.mtimeMs)}"`;
    if (etag !== undefined) this.set("ETag", etag);

    if (options?.headers !== undefined) {
      for (const key in options.headers) this.set(key, options.headers[key]!);
    }
    if (options?.lastModified !== false) {
      this.set("Last-Modified", new Date(stats.mtimeMs).toUTCString());
    }
    if (options?.acceptRanges !== false) {
      this.set("Accept-Ranges", "bytes");
    }
    applyCacheHeaders(this, options);
    if (options?.headers?.["content-type"] === undefined) {
      const contentType = this.get("content-type");
      if (contentType === undefined || contentType.length === 0) this.type(lookupMimeType(fileName));
    }

    const requestEtag = this.req?.get("if-none-match");
    const requestModifiedSince = this.req?.get("if-modified-since");
    const unchanged = requestEtag !== undefined
      ? etag !== undefined && requestEtag.split(",").some((value) => value.trim() === etag || value.trim() === "*")
      : requestModifiedSince !== undefined && options?.lastModified !== false &&
        Number.isFinite(Date.parse(requestModifiedSince)) &&
        Math.floor(stats.mtimeMs / 1000) <= Math.floor(Date.parse(requestModifiedSince) / 1000);
    if (unchanged && (this.req?.method === "GET" || this.req?.method === "HEAD")) {
      this.statusCode = 304;
      this.#transport.sendText("");
      return;
    }

    let start = 0;
    let end = stats.size - 1;
    if (options?.acceptRanges !== false && this.req?.get("range") !== undefined) {
      const selected = this.req.range(stats.size);
      if (selected === -1) {
        this.set("Content-Range", `bytes */${String(stats.size)}`);
        throw createHttpError(416, "Range Not Satisfiable");
      }
      if (typeof selected !== "number" && selected.ranges.length === 1) {
        start = selected.ranges[0]!.start;
        end = selected.ranges[0]!.end;
        this.statusCode = 206;
        this.set("Content-Range", `bytes ${String(start)}-${String(end)}/${String(stats.size)}`);
      }
    }
    const compress = this.prepareCompression(stats.size === 0 ? 0 : end - start + 1);
    if (!compress) this.set("Content-Length", String(stats.size === 0 ? 0 : end - start + 1));
    if (this.req?.method === "HEAD" || stats.size === 0) {
      this.#transport.sendText("");
      return;
    }
    const source = createReadStream(canonicalPath, { start, end });
    if (compress) await this.pipeCompressed(source);
    else await this.#transport.pipeFrom(source);
  }

  set(field: string, value: unknown): this;
  set(fields: Record<string, unknown>): this;
  set(fieldOrFields: string | Record<string, unknown>, value?: unknown): this {
    if (typeof fieldOrFields === "string") {
      return this.set_one(fieldOrFields, value);
    }

    return this.set_many(fieldOrFields);
  }

  set_one(field: string, value: unknown = ""): this {
    const rendered = value == null ? "" : String(value);
    this.#headers[field.toLowerCase()] = rendered;
    this.#transport.setHeader(field, rendered);
    return this;
  }

  set_many(fields: Record<string, unknown>): this {
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
    if (current === undefined || current.length === 0) {
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

function stringifyResponseJsonValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return stringifyJsonValue(value);
}

function stringifyOptionalResponseJsonValue(value: unknown | undefined): string {
  return value === undefined ? "null" : stringifyResponseJsonValue(value);
}

function stringifyJsonValue(value: unknown): string {
  const serialized = stringifyJsonMemberValue(value, []);
  return serialized === undefined ? "null" : serialized;
}

function stringifyJsonMemberValue(
  value: unknown | undefined,
  seen: object[]
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return stringifyJsonDefinedValue(value, seen);
}

function stringifyJsonDefinedValue(value: unknown, seen: object[]): string | undefined {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return quoteJsonString(value);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "null";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value !== "object") {
    return undefined;
  }

  if (hasSeenJsonObject(value, seen)) {
    throw new Error("Converting circular structure to JSON.");
  }

  const nextSeen = [...seen, value];
  if (Array.isArray(value)) {
    const array = value as unknown[];
    const items: string[] = [];
    for (let index = 0; index < array.length; index += 1) {
      items.push(stringifyJsonMemberValue(array[index], nextSeen) ?? "null");
    }
    return `[${items.join(",")}]`;
  }

  const record = value as Record<string, unknown | undefined>;
  const keys = Object.keys(record);
  const properties: string[] = [];
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]!;
    const renderedValue = stringifyJsonMemberValue(record[key], nextSeen);
    if (renderedValue !== undefined) {
      properties.push(`${quoteJsonString(key)}:${renderedValue}`);
    }
  }
  return `{${properties.join(",")}}`;
}

function hasSeenJsonObject(value: object, seen: object[]): boolean {
  for (let index = 0; index < seen.length; index += 1) {
    if (seen[index] === value) {
      return true;
    }
  }

  return false;
}

function quoteJsonString(value: string): string {
  let result = "\"";
  for (let index = 0; index < value.length; index += 1) {
    const current = value[index]!;
    const code = value.charCodeAt(index);
    if (current === "\"") {
      result += "\\\"";
    } else if (current === "\\") {
      result += "\\\\";
    } else if (current === "\b") {
      result += "\\b";
    } else if (current === "\f") {
      result += "\\f";
    } else if (current === "\n") {
      result += "\\n";
    } else if (current === "\r") {
      result += "\\r";
    } else if (current === "\t") {
      result += "\\t";
    } else if (code < 32) {
      result += unicodeEscape(code);
    } else {
      result += current;
    }
  }

  return `${result}\"`;
}

function unicodeEscape(code: number): string {
  const first = Math.floor(code / 4096);
  const second = Math.floor((code - first * 4096) / 256);
  const third = Math.floor((code - first * 4096 - second * 256) / 16);
  const fourth = code - first * 4096 - second * 256 - third * 16;
  return `\\u${hexDigit(first)}${hexDigit(second)}${hexDigit(third)}${hexDigit(fourth)}`;
}

function hexDigit(value: number): string {
  switch (value) {
    case 0:
      return "0";
    case 1:
      return "1";
    case 2:
      return "2";
    case 3:
      return "3";
    case 4:
      return "4";
    case 5:
      return "5";
    case 6:
      return "6";
    case 7:
      return "7";
    case 8:
      return "8";
    case 9:
      return "9";
    case 10:
      return "a";
    case 11:
      return "b";
    case 12:
      return "c";
    case 13:
      return "d";
    case 14:
      return "e";
    default:
      return "f";
  }
}


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
  } else if (optionsOrCallback !== undefined) {
    options = optionsOrCallback;
  }

  if (maybeCallback !== undefined) {
    callback = maybeCallback;
  }

  return { filename, options, callback };
}

function resolveSendFilePath(path: string, root?: string): string {
  if (root === undefined || root.length === 0) {
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
  if (options !== undefined && options.cacheControl === false) {
    return;
  }

  const maxAge = normalizeMaxAge(options?.maxAge);
  let value = maxAge > 0 ? `public, max-age=${maxAge}` : "public, max-age=0";
  if (options !== undefined && options.immutable === true) {
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
  if (match === null) {
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

function isCompressibleType(type: string | undefined): boolean {
  if (type === undefined) return false;
  const mediaType = type.split(";", 1)[0]!.trim().toLowerCase();
  return mediaType.startsWith("text/") ||
    mediaType === "application/json" ||
    mediaType === "application/javascript" ||
    mediaType === "application/xml" ||
    mediaType === "application/xhtml+xml" ||
    mediaType === "image/svg+xml";
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
