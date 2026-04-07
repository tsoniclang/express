import { asinterface, overloads as O } from "@tsonic/core/lang.js";
import type { JsValue } from "@tsonic/core/types.js";
import { Buffer } from "node:buffer";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from "node:http";

import type { Application } from "../application.js";
import type {
  TransportContext,
  TransportRequest,
  TransportResponse
} from "../types.js";
import { AppServer } from "./app-server.js";

interface RequestHeadersLookup {
  [name: string]: string | readonly string[] | undefined;
}

interface RequestWithHeadersLookup {
  headers: RequestHeadersLookup;
}

interface PathListeningServer {
  listen(path: string, callback: () => void): JsValue;
}

interface PortListeningServer {
  listen(port: number, callback: () => void): JsValue;
}

interface PortHostListeningServer {
  listen(port: number, host: string, callback: () => void): JsValue;
}

interface PortHostBacklogListeningServer {
  listen(port: number, host: string, backlog: number, callback: () => void): JsValue;
}

interface EmptyEndableResponse {
  end(): JsValue;
}

interface TextEndableResponse {
  end(chunk: string): JsValue;
}

interface BytesEndableResponse {
  end(chunk: Uint8Array): JsValue;
}

interface ResponseHeaderLookup {
  getHeader(name: string): string | readonly string[] | undefined;
}
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
  if (typeof hostOrCallback === "function" || hostOrCallback === undefined) {
    return listenOnPort_port(
      app,
      port,
      typeof hostOrCallback === "function" ? hostOrCallback : undefined
    );
  }

  if (
    typeof backlogOrCallback === "function" ||
    backlogOrCallback === undefined
  ) {
    return listenOnPort_host(
      app,
      port,
      hostOrCallback,
      typeof backlogOrCallback === "function" ? backlogOrCallback : undefined
    );
  }

  return listenOnPort_backlog(
    app,
    port,
    hostOrCallback,
    backlogOrCallback,
    maybeCallback
  );
}

export function listenOnPort_port(
  app: Application,
  port: number,
  callback?: () => void
): AppServer {
  return listenOnPortResolved(app, port, undefined, undefined, callback);
}

export function listenOnPort_host(
  app: Application,
  port: number,
  host: string,
  callback?: () => void
): AppServer {
  return listenOnPortResolved(app, port, host, undefined, callback);
}

export function listenOnPort_backlog(
  app: Application,
  port: number,
  host: string,
  backlog: number,
  callback?: () => void
): AppServer {
  return listenOnPortResolved(app, port, host, backlog, callback);
}

function listenOnPortResolved(
  app: Application,
  port: number,
  host: string | undefined,
  backlog: number | undefined,
  callback: (() => void) | undefined
): AppServer {
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
        if (error instanceof Error) {
          done(error);
        } else {
          done(new Error("Server close failed."));
        }
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
  asinterface<PathListeningServer>(nodeServer).listen(path, callback);
}

function callListenOnPort(
  nodeServer: Server,
  port: number,
  callback: () => void
): void {
  asinterface<PortListeningServer>(nodeServer).listen(port, callback);
}

function callListenOnPortHost(
  nodeServer: Server,
  port: number,
  host: string,
  callback: () => void
): void {
  asinterface<PortHostListeningServer>(nodeServer).listen(
    port,
    host,
    callback
  );
}

function callListenOnPortHostBacklog(
  nodeServer: Server,
  port: number,
  host: string,
  backlog: number,
  callback: () => void
): void {
  asinterface<PortHostBacklogListeningServer>(nodeServer).listen(
    port,
    host,
    backlog,
    callback
  );
}

async function dispatchNodeRequest(
  app: Application,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const rawBodyBytes = await readRequestBody(request);
  const bodyBytes = rawBodyBytes.length > 0 ? rawBodyBytes : undefined;
  const transportResponse = new NodeTransportResponse(response);
  const context: TransportContext = {
    request: createTransportRequest(request, bodyBytes),
    response: transportResponse
  };

  try {
    await app.handle(context, app);
    if (!response.headersSent && response.statusCode === 200) {
      response.statusCode = 404;
      asinterface<EmptyEndableResponse>(response).end();
    }
  } catch (error) {
    if (!response.headersSent) {
      response.statusCode = 500;
      if (error instanceof Error) {
        asinterface<TextEndableResponse>(response).end(error.message);
      } else {
        asinterface<TextEndableResponse>(response).end(
          "Internal Server Error"
        );
      }
      return;
    }

    request.destroy();
  }
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
  const requestHeaders = asinterface<RequestWithHeadersLookup>(request).headers;
  for (const key in requestHeaders) {
    const headerValue = normalizeHeaderValue(requestHeaders[key]);
    if (headerValue !== undefined) {
      headers[key.toLowerCase()] = headerValue;
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
  query: Record<string, JsValue>;
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

function parseQueryString(queryString: string): Record<string, JsValue> {
  const query: Record<string, JsValue> = {};

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

    if (typeof current === "string") {
      query[key] = [current, value];
      continue;
    }

    const currentValues = current as string[];
    query[key] = [...currentValues, value];
  }

  return query;
}

async function readRequestBody(
  request: IncomingMessage
): Promise<Uint8Array> {
  const bodyPromise: Promise<Uint8Array> = new Promise(
    (resolve, reject) => {
      const chunks: Uint8Array[] = [];

      request.on(
        "data",
        (...args: JsValue[]) => {
          const chunk = args[0];
          if (typeof chunk === "string") {
            chunks.push(toUint8Array(Buffer.from(chunk, "utf-8")));
            return;
          }

          if (chunk instanceof Uint8Array) {
            chunks.push(toUint8Array(chunk));
            return;
          }

          reject(new Error("Incoming request emitted a non-bytes data chunk."));
        }
      );

      request.on("end", (..._args: JsValue[]) => {
        const bytes = concatChunks(chunks);
        resolve(bytes);
      });

      request.on("error", (...args: JsValue[]) => {
        reject(args[0]);
      });
    }
  );

  return await bodyPromise;
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
      asinterface<ResponseHeaderLookup>(this.#response).getHeader(name)
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
    asinterface<TextEndableResponse>(this.#response).end(text);
  }

  sendBytes(bytes: Uint8Array): void {
    asinterface<BytesEndableResponse>(this.#response).end(bytes);
  }
}

O(listenOnPort_port).family(listenOnPort);
O(listenOnPort_host).family(listenOnPort);
O(listenOnPort_backlog).family(listenOnPort);

function decodeQueryComponent(value: string): string {
  return decodePercentEscapes(value.replaceAll("+", " "));
}

function decodePercentEscapes(value: string): string {
  if (!value.includes("%")) {
    return value;
  }

  let bytes: number[] = [];
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

    bytes = appendBufferBytes(bytes, Buffer.from(current, "utf-8"));
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

function appendBufferBytes(target: number[], buffer: Buffer): number[] {
  for (let byteIndex = 0; byteIndex < buffer.length; byteIndex += 1) {
    target.push(buffer.readUInt8(byteIndex));
  }
  return target;
}

function toUint8Array(buffer: Buffer | Uint8Array): Uint8Array {
  if (buffer instanceof Buffer) {
    const bytes = new Uint8Array(buffer.length);
    for (let index = 0; index < buffer.length; index += 1) {
      bytes[index] = buffer.readUInt8(index);
    }
    return bytes;
  }

  const bytes = new Uint8Array(buffer.length);
  for (let index = 0; index < buffer.length; index += 1) {
    bytes[index] = buffer[index]!;
  }
  return bytes;
}

function bytesToText(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("utf-8");
}

function normalizeHeaderValue(
  value: string | readonly string[] | undefined
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  return value.join(", ");
}
