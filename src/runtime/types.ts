import type { JsValue } from "@tsonic/core/types.js";
import type { Request } from "./request.js";
import type { Response } from "./response.js";
import type { Router } from "./router.js";

export interface TransportRequest {
  method: string;
  path: string;
  headers?: Record<string, string>;
  bodyText?: string;
  bodyBytes?: Uint8Array;
  query?: Record<string, JsValue>;
}

export interface TransportResponse {
  statusCode: number;
  headersSent: boolean;
  setHeader(name: string, value: string): void;
  getHeader(name: string): string | undefined;
  appendHeader(name: string, value: string): void;
  sendText(text: string): void;
  sendBytes(bytes: Uint8Array): void;
}

export interface TransportContext {
  request: TransportRequest;
  response: TransportResponse;
}

export type PathSpec = string | RegExp | readonly PathSpec[];
export type NextControl = "route" | "router" | string | null | undefined;
export type NextFunction = (value?: NextControl) => void | Promise<void>;
export type IgnoredHandlerResult = void | JsValue | Promise<void | JsValue>;
export interface RequestHandler {
  (
    req: Request,
    res: Response,
    next: NextFunction
  ): IgnoredHandlerResult;
}

export interface ErrorRequestHandler {
  (
    error: JsValue,
    req: Request,
    res: Response,
    next: NextFunction
  ): IgnoredHandlerResult;
}

export type RouteHandler = RequestHandler;
export type TemplateCallback = (error: Error | null, html?: string) => void;
export type TemplateEngine = (
  view: string,
  locals: Record<string, JsValue>,
  callback: TemplateCallback
) => void;
export type ParamHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
  value: string | undefined,
  name: string
) => IgnoredHandlerResult;
