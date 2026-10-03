import type { Buffer } from "node:buffer";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Readable } from "node:stream";

import type { Application } from "../application.js";
import { toHttpStatusCode } from "../numeric.js";
import { decodePercentEncoded } from "../percent-decoding.js";
import { requireSafeRecordKey } from "../safe-record-key.js";
import type { RequestFailure, TransportContext, TransportError, TransportRequest, TransportResponse } from "../types.js";
import { AppServer } from "./app-server.js";

export function listenOnPath(app: Application, path: string, callback?: () => void): AppServer {
  const { appServer, nodeServer } = createNodeServer(app, undefined, undefined, path);
  nodeServer.listen(path, () => {
    callback?.();
  });
  return appServer;
}

export function listenOnPort(app: Application, port: number, callback?: () => void): AppServer;
export function listenOnPort(app: Application, port: number, host: string, callback?: () => void): AppServer;
export function listenOnPort(app: Application, port: number, host: string, backlog: number, callback?: () => void): AppServer;
export function listenOnPort(
  app: Application,
  port: number,
  hostOrCallback?: string | (() => void),
  backlogOrCallback?: number | (() => void),
  callback?: () => void
): AppServer {
  if (typeof hostOrCallback !== "string") {
    return listenOnPort_port(app, port, hostOrCallback);
  }
  if (typeof backlogOrCallback !== "number") {
    return listenOnPort_host(app, port, hostOrCallback, backlogOrCallback);
  }
  return listenOnPort_backlog(app, port, hostOrCallback, backlogOrCallback, callback);
}

export function listenOnPort_port(app: Application, port: number, callback?: () => void): AppServer {
  const { appServer, nodeServer } = createNodeServer(app, port, undefined, undefined);
  nodeServer.listen(port, () => {
    syncBinding(appServer, nodeServer);
    callback?.();
  });
  return appServer;
}

export function listenOnPort_host(
  app: Application,
  port: number,
  host: string,
  callback?: () => void
): AppServer {
  const { appServer, nodeServer } = createNodeServer(app, port, host, undefined);
  nodeServer.listen(port, host, () => {
    syncBinding(appServer, nodeServer);
    callback?.();
  });
  return appServer;
}

export function listenOnPort_backlog(
  app: Application,
  port: number,
  host: string,
  backlog: number,
  callback?: () => void
): AppServer {
  const { appServer, nodeServer } = createNodeServer(app, port, host, undefined);
  nodeServer.listen(port, host, backlog, () => {
    syncBinding(appServer, nodeServer);
    callback?.();
  });
  return appServer;
}

function createNodeServer(
  app: Application,
  port: number | undefined,
  host: string | undefined,
  path: string | undefined
): { appServer: AppServer; nodeServer: Server } {
  const nodeServer = createServer((request, response) => {
    void dispatchNodeRequest(app, request, response);
  });
  const appServer = new AppServer(port, host, path, (done) => {
    nodeServer.close((error) => done?.(error));
  });
  return { appServer, nodeServer };
}

async function dispatchNodeRequest(
  app: Application,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  let transportRequest: TransportRequest;
  try {
    transportRequest = createTransportRequest(request);
  } catch {
    response.statusCode = 400;
    response.end("Bad Request");
    return;
  }
  const context: TransportContext = {
    request: transportRequest,
    response: new NodeTransportResponse(response)
  };

  try {
    await app.handle(context, app);
    if (!response.writableEnded && !response.headersSent) {
      response.statusCode = 404;
      response.end();
    }
  } catch (error) {
    const failure = error instanceof Error ? error : new Error("Internal Server Error");
    if (response.headersSent) {
      response.destroy(failure);
      return;
    }
    response.statusCode = 500;
    response.end(failure.message);
  }
}

function syncBinding(appServer: AppServer, nodeServer: Server): void {
  const bound = nodeServer.address();
  if (bound != null && typeof bound !== "string") {
    appServer.updateBinding(bound.port, appServer.host, undefined);
  }
}

function createTransportRequest(request: IncomingMessage): TransportRequest {
  const rawUrl = request.url ?? "/";
  const parsed = splitPathAndQuery(rawUrl);
  return {
    method: request.method ?? "GET",
    path: parsed.pathname,
    query: parsed.query,
    headers: request.headersDistinct,
    body: request,
    cleanup: []
  };
}

function splitPathAndQuery(rawUrl: string): {
  pathname: string;
  query: Record<string, unknown>;
} {
  const queryIndex = rawUrl.indexOf("?");
  if (queryIndex < 0) {
    return { pathname: rawUrl.length > 0 ? rawUrl : "/", query: {} };
  }
  return {
    pathname: queryIndex === 0 ? "/" : rawUrl.slice(0, queryIndex),
    query: parseQueryString(rawUrl.slice(queryIndex + 1))
  };
}

function parseQueryString(source: string): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  for (const pair of source.split("&")) {
    if (pair.length === 0) continue;
    const separator = pair.indexOf("=");
    const key = decodeQueryComponent(separator < 0 ? pair : pair.slice(0, separator));
    requireSafeRecordKey(key);
    const value = decodeQueryComponent(separator < 0 ? "" : pair.slice(separator + 1));
    const current = query[key];
    if (current === undefined) query[key] = value;
    else if (typeof current === "string") query[key] = [current, value];
    else if (Array.isArray(current)) (current as string[]).push(value);
  }
  return query;
}

function decodeQueryComponent(value: string): string {
  const normalized = value.replaceAll("+", " ");
  try {
    return decodePercentEncoded(normalized);
  } catch {
    return normalized;
  }
}

class NodeTransportResponse implements TransportResponse {
  readonly #response: ServerResponse;

  constructor(response: ServerResponse) {
    this.#response = response;
  }

  get statusCode(): number { return this.#response.statusCode; }
  set statusCode(value: number) { this.#response.statusCode = toHttpStatusCode(value); }
  get headersSent(): boolean { return this.#response.headersSent; }

  setHeader(name: string, value: string): void { this.#response.setHeader(name, value); }
  removeHeader(name: string): void { this.#response.removeHeader(name); }
  appendHeader(name: string, value: string): void { this.#response.appendHeader(name, value); }
  getHeader(name: string): string | undefined {
    const value = this.#response.getHeader(name);
    if (value === undefined) return undefined;
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    return value[0];
  }
  sendText(text: string): void { this.#response.end(text); }
  sendBytes(bytes: Buffer): void { this.#response.end(bytes); }

  async pipeFrom(source: Readable): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const detach = (): void => {
        source.off("error", onSourceError);
        this.#response.off("finish", onFinish);
        this.#response.off("error", onResponseError);
        this.#response.off("close", onClose);
      };
      const fail = (error: RequestFailure): void => {
        if (settled) return;
        settled = true;
        detach();
        source.destroy();
        this.#response.destroy();
        reject(error);
      };
      const onSourceError = (error: TransportError): void => fail(error);
      const onResponseError = (error: TransportError): void => fail(error);
      const onClose = (): void => fail(new Error("response closed before stream completion"));
      const onFinish = (): void => {
        if (settled) return;
        settled = true;
        detach();
        resolve();
      };
      source.once("error", onSourceError);
      this.#response.once("finish", onFinish);
      this.#response.once("error", onResponseError);
      this.#response.once("close", onClose);
      source.pipe(this.#response);
    });
  }
}
