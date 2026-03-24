import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import type {
  IncomingMessage,
  Server,
  ServerResponse
} from "node:http";

import type { Application } from "../application.js";
import type {
  TransportContext,
  TransportRequest,
  TransportResponse
} from "../types.js";
import { AppServer } from "./app-server.js";

type ListenCallback = (() => void) | undefined;
type HeaderLookupValue = string | string[] | number | null | undefined;

export function listenOnPath(
  app: Application,
  path: string,
  callback?: () => void
): AppServer {
  const { appServer, nodeServer } = createNodeServer(
    app,
    undefined,
    undefined,
    path
  );

  callListenOnPath(nodeServer, path, () => {
    syncBinding(appServer, nodeServer);
    if (callback) {
      callback();
    }
  });

  return appServer;
}

export function listenOnPort(
  app: Application,
  port: number,
  callback?: () => void
): AppServer;
export function listenOnPort(
  app: Application,
  port: number,
  host: string,
  callback?: () => void
): AppServer;
export function listenOnPort(
  app: Application,
  port: number,
  host: string,
  backlog: number,
  callback?: () => void
): AppServer;
export function listenOnPort(
  app: Application,
  port: number,
  hostOrCallback?: string | (() => void),
  backlogOrCallback?: number | (() => void),
  maybeCallback?: () => void
): AppServer {
  const host = typeof hostOrCallback === "string" ? hostOrCallback : undefined;
  const backlog =
    typeof backlogOrCallback === "number" ? backlogOrCallback : undefined;
  const callback = resolveListenCallback(
    hostOrCallback,
    backlogOrCallback,
    maybeCallback
  );

  const { appServer, nodeServer } = createNodeServer(
    app,
    port,
    host,
    undefined
  );

  const onListening = (): void => {
    syncBinding(appServer, nodeServer);
    if (callback) {
      callback();
    }
  };

  if (host !== undefined && backlog !== undefined) {
    callListenOnPortHostBacklog(nodeServer, port, host, backlog, onListening);
    return appServer;
  }

  if (host !== undefined) {
    callListenOnPortHost(nodeServer, port, host, onListening);
    return appServer;
  }

  callListenOnPort(nodeServer, port, onListening);
  return appServer;
}

function createNodeServer(
  app: Application,
  port: number | undefined,
  host: string | undefined,
  path: string | undefined
): { appServer: AppServer; nodeServer: Server } {
  let nodeServer!: Server;

  const appServer = new AppServer(port, host, path, (done) => {
    try {
      nodeServer.close(() => {
        if (done) {
          done(undefined);
        }
      });
    } catch (error) {
      if (done) {
        done(normalizeError(error));
      }
    }
  });

  nodeServer = createServer((request, response) => {
    void dispatchNodeRequest(
      app,
      request,
      response
    );
  });

  return { appServer, nodeServer };
}

function callListenOnPath(
  nodeServer: Server,
  path: string,
  callback: () => void
): void {
  (
    nodeServer as unknown as {
      listen(path: string, callback: () => void): unknown;
    }
  ).listen(path, callback);
}

function callListenOnPort(
  nodeServer: Server,
  port: number,
  callback: () => void
): void {
  (
    nodeServer as unknown as {
      listen(port: number, callback: () => void): unknown;
    }
  ).listen(port, callback);
}

function callListenOnPortHost(
  nodeServer: Server,
  port: number,
  host: string,
  callback: () => void
): void {
  (
    nodeServer as unknown as {
      listen(port: number, host: string, callback: () => void): unknown;
    }
  ).listen(port, host, callback);
}

function callListenOnPortHostBacklog(
  nodeServer: Server,
  port: number,
  host: string,
  backlog: number,
  callback: () => void
): void {
  (
    nodeServer as unknown as {
      listen(
        port: number,
        host: string,
        backlog: number,
        callback: () => void
      ): unknown;
    }
  ).listen(port, host, backlog, callback);
}

async function dispatchNodeRequest(
  app: Application,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const bodyBytes = await readRequestBody(request);
  const transportResponse = new NodeTransportResponse(response);
  const context: TransportContext = {
    request: createTransportRequest(request, bodyBytes),
    response: transportResponse
  };

  try {
    await app.handle(context, app);
    if (!response.headersSent && response.statusCode === 200) {
      response.statusCode = 404;
      response.end();
    }
  } catch (error) {
    if (!response.headersSent) {
      response.statusCode = 500;
      response.end(normalizeError(error).message);
      return;
    }

    request.destroy();
  }
}

function resolveListenCallback(
  hostOrCallback?: string | (() => void),
  backlogOrCallback?: number | (() => void),
  maybeCallback?: () => void
): (() => void) | undefined {
  if (typeof hostOrCallback === "function") {
    return hostOrCallback;
  }

  if (typeof backlogOrCallback === "function") {
    return backlogOrCallback;
  }

  return maybeCallback;
}

function syncBinding(appServer: AppServer, nodeServer: Server): void {
  const address = nodeServer.address() as { port: number } | null;
  if (address === null) {
    return;
  }

  const nextPort =
    appServer.port === undefined || appServer.port === 0
      ? address.port
      : appServer.port;
  appServer.updateBinding(nextPort, appServer.host, appServer.path);
}

function createTransportRequest(
  request: IncomingMessage,
  bodyBytes?: Uint8Array
): TransportRequest {
  const url = request.url ?? "/";
  const parsedUrl = splitPathAndQuery(url);
  const headers: Record<string, string> = {};
  for (const key in request.headers) {
    const normalized = normalizeHeaderValue(request.headers[key]);
    if (normalized !== undefined) {
      headers[key.toLowerCase()] = normalized;
    }
  }

  return {
    method: request.method ?? "GET",
    path: parsedUrl.pathname,
    headers,
    bodyBytes,
    bodyText:
      bodyBytes !== undefined && bodyBytes.length > 0
        ? bytesToText(bodyBytes)
        : undefined,
    query: parsedUrl.query
  };
}

function splitPathAndQuery(rawUrl: string): {
  pathname: string;
  query: Record<string, unknown>;
} {
  const queryIndex = rawUrl.indexOf("?");
  if (queryIndex < 0) {
    return {
      pathname: rawUrl.length > 0 ? rawUrl : "/",
      query: {}
    };
  }

  return {
    pathname: queryIndex === 0 ? "/" : rawUrl.slice(0, queryIndex),
    query: parseQueryString(rawUrl.slice(queryIndex + 1))
  };
}

function parseQueryString(queryString: string): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  if (queryString.length === 0) {
    return query;
  }

  for (const pair of queryString.split("&")) {
    if (pair.length === 0) {
      continue;
    }

    const equalsIndex = pair.indexOf("=");
    const key = decodeQueryComponent(
      equalsIndex < 0 ? pair : pair.slice(0, equalsIndex)
    );
    const value = decodeQueryComponent(
      equalsIndex < 0 ? "" : pair.slice(equalsIndex + 1)
    );
    const current = query[key];
    if (current === undefined) {
      query[key] = value;
      continue;
    }

    if (Array.isArray(current)) {
      query[key] = [...current, value];
      continue;
    }

    query[key] = [current, value];
  }

  return query;
}

function normalizeHeaderValue(value: HeaderLookupValue): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  let combined = "";
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index]!;
    if (combined.length > 0) {
      combined += ", ";
    }
    combined += item;
  }

  return combined.length > 0 ? combined : undefined;
}

async function readRequestBody(
  request: IncomingMessage
): Promise<Uint8Array | undefined> {
  const requestWithReadAll = request as IncomingMessage & {
    readAll?: () => Promise<string>;
  };
  if (typeof requestWithReadAll.readAll === "function") {
    const text = await requestWithReadAll.readAll();
    return text.length > 0 ? textToBytes(text) : undefined;
  }

  return await readNativeRequestBody(request);
}

async function readNativeRequestBody(
  request: IncomingMessage
): Promise<Uint8Array | undefined> {
  const chunks: Uint8Array[] = [];
  const stream = request as unknown as {
    on(eventName: string, listener: (value?: unknown) => void): unknown;
  };
  let bodyBytes: Uint8Array | undefined;

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk?: unknown) => {
      if (chunk === undefined || chunk === null) {
        return;
      }

      chunks.push(toChunkBytes(chunk));
    });

    stream.on("end", () => {
      if (chunks.length === 0) {
        bodyBytes = undefined;
        resolve();
        return;
      }

      bodyBytes = concatChunks(chunks);
      resolve();
    });

    stream.on("error", (error?: unknown) => {
      reject(normalizeError(error));
    });
  });

  return bodyBytes;
}

function toChunkBytes(chunk: unknown): Uint8Array {
  if (chunk instanceof Uint8Array) {
    return chunk;
  }

  if (typeof chunk === "string") {
    return textToBytes(chunk);
  }

  return textToBytes(String(chunk));
}

function concatChunks(chunks: readonly Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (const chunk of chunks) {
    totalLength += chunk.length;
  }

  const buffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }

  return buffer;
}

class NodeTransportResponse implements TransportResponse {
  readonly #response: ServerResponse;

  constructor(response: ServerResponse) {
    this.#response = response;
  }

  get statusCode(): number {
    return this.#response.statusCode;
  }

  set statusCode(value: number) {
    this.#response.statusCode = value;
  }

  get headersSent(): boolean {
    return this.#response.headersSent;
  }

  set headersSent(_value: boolean) {}

  setHeader(name: string, value: string): void {
    this.#response.setHeader(name, value);
  }

  getHeader(name: string): string | undefined {
    return normalizeHeaderValue(
      this.#response.getHeader(name) as HeaderLookupValue
    );
  }

  appendHeader(name: string, value: string): void {
    const current = this.getHeader(name);
    if (current === undefined) {
      this.#response.setHeader(name, value);
      return;
    }

    this.#response.setHeader(name, `${current}, ${value}`);
  }

  sendText(text: string): void {
    this.#response.end(text);
  }

  sendBytes(bytes: Uint8Array): void {
    this.#response.end(bytes);
  }
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function decodeQueryComponent(value: string): string {
  return decodePercentEscapes(value.replaceAll("+", " "));
}

function decodePercentEscapes(value: string): string {
  if (!value.includes("%")) {
    return value;
  }

  const bytes: number[] = [];
  let index = 0;

  while (index < value.length) {
    const current = value[index]!;
    if (current === "%" && index + 2 < value.length) {
      const high = parseHexDigit(value[index + 1]!);
      const low = parseHexDigit(value[index + 2]!);
      if (high >= 0 && low >= 0) {
        bytes.push((high << 4) | low);
        index += 3;
        continue;
      }
    }

    appendBufferBytes(bytes, Buffer.from(current, "utf-8"));
    index += 1;
  }

  return Buffer.from(bytes).toString("utf-8");
}

function parseHexDigit(value: string): number {
  const code = value.charCodeAt(0);
  if (code >= 48 && code <= 57) {
    return code - 48;
  }

  if (code >= 65 && code <= 70) {
    return code - 55;
  }

  if (code >= 97 && code <= 102) {
    return code - 87;
  }

  return -1;
}

function appendBufferBytes(target: number[], buffer: Buffer): void {
  for (let byteIndex = 0; byteIndex < buffer.length; byteIndex += 1) {
    target.push(buffer.readUInt8(byteIndex));
  }
}

function toUint8Array(buffer: Buffer): Uint8Array {
  const bytes = new Uint8Array(buffer.length);
  for (let index = 0; index < buffer.length; index += 1) {
    bytes[index] = buffer.readUInt8(index);
  }
  return bytes;
}

function bytesToText(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("utf-8");
}

function textToBytes(value: string): Uint8Array {
  return toUint8Array(Buffer.from(value, "utf-8"));
}
