import type { Request } from "./request.js";
import type { Response } from "./response.js";
import type { Router } from "./router.js";

export interface TransportRequest {
  method: string;
  path: string;
  headers?: Record<string, string>;
  bodyText?: string;
  bodyBytes?: Uint8Array;
  query?: Record<string, unknown>;
}

export interface TransportResponse {
  statusCode: number;
  headersSent: boolean;
  setHeader(name: string, value: string): void;
  getHeader(name: string): string | undefined;
  appendHeader(name: string, value: string): void;
  sendText(text: string): Promise<void> | void;
  sendBytes(bytes: Uint8Array): Promise<void> | void;
}

export interface TransportContext {
  request: TransportRequest;
  response: TransportResponse;
}

export type PathSpec = string | RegExp | readonly PathSpec[] | null | undefined;
export type NextControl = "route" | "router" | string | null | undefined;
export type NextFunction = (value?: NextControl) => void | Promise<void>;
export interface RequestHandler {
  (req: Request, res: Response, next: NextFunction): unknown | Promise<unknown>;
}

export interface ErrorRequestHandler {
  (error: unknown, req: Request, res: Response, next: NextFunction): unknown | Promise<unknown>;
}

export type RouteHandler = RequestHandler;
export type TemplateCallback = (error: unknown, html?: string) => void;
export type TemplateEngine = (view: string, locals: Record<string, unknown>, callback: TemplateCallback) => void;
export type ParamHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
  value: string | undefined,
  name: string
) => unknown | Promise<unknown>;
