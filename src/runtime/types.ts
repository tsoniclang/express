import type { Buffer } from "node:buffer";
import type { IncomingMessage } from "node:http";
import type { Readable } from "node:stream";
import type { Request } from "./request.js";
import type { Response } from "./response.js";
import type { Router } from "./router.js";

export interface TransportRequest {
  method: string;
  path: string;
  headers: IncomingMessage["headersDistinct"];
  body: Readable;
  cleanup: Array<() => Promise<void>>;
  query?: Record<string, unknown>;
}

export type RequestHeaders = Record<string, string[] | undefined>;

export type TransportError = NonNullable<Parameters<Readable["destroy"]>[0]>;
export type RequestFailure = Error | TransportError;

export interface TransportResponse {
  statusCode: number;
  readonly headersSent: boolean;
  setHeader(name: string, value: string): void;
  getHeader(name: string): string | undefined;
  removeHeader(name: string): void;
  appendHeader(name: string, value: string): void;
  sendText(text: string): void;
  sendBytes(bytes: Buffer): void;
  pipeFrom(source: Readable): Promise<void>;
}

export interface TransportContext {
  request: TransportRequest;
  response: TransportResponse;
}

export type PathSpec = string | RegExp | readonly PathSpec[];
export type NextControl = string | RequestFailure | null | undefined;
export type NextFunction = (value?: NextControl) => void | Promise<void>;
export type IgnoredHandlerResult =
  | void
  | Response
  | Promise<void | Response>;
export interface RequestHandler {
  (
    req: Request,
    res: Response,
    next: NextFunction
  ): IgnoredHandlerResult;
}

export interface ErrorRequestHandler {
  (
    error: unknown,
    req: Request,
    res: Response,
    next: NextFunction
  ): IgnoredHandlerResult;
}

export type RouteHandler = RequestHandler;
export type MiddlewareEntry = RequestHandler | ErrorRequestHandler | Router;
export type TemplateCallback = (error: Error | null, html?: string) => void;
export type TemplateEngine = (
  view: string,
  locals: Record<string, unknown>,
  callback: TemplateCallback
) => void;
export type ParamHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
  value: string | undefined,
  name: string
) => IgnoredHandlerResult;
