import type { JsValue } from "@tsonic/core/types.js";

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
export type IgnoredHandlerResult =
  | void
  | JsValue
  | Response
  | Promise<void | JsValue | Response>;

export interface RequestHandler {
  (req: Request, res: Response, next: NextFunction): IgnoredHandlerResult;
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
export type ParamHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
  value: string | undefined,
  name: string
) => IgnoredHandlerResult;
export type TemplateCallback = (error: Error | null, html?: string) => void;
export type TemplateEngine = (
  view: string,
  locals: Record<string, JsValue>,
  callback: TemplateCallback
) => void;

export interface CookieOptions {
  domain?: string;
  encode?: (value: string) => string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  priority?: "low" | "medium" | "high";
  sameSite?: boolean | "lax" | "strict" | "none";
  secure?: boolean;
  signed?: boolean;
}

export type JsonRecord = Record<string, JsValue>;
export type SendFileCallback = (error: Error | null) => void;
export type FormatHandler = (req: Request, res: Response, next: NextFunction) => void;
export type FormatHandlers = Record<string, FormatHandler>;

export class Params {
  get(name: string): string | undefined;
  set(name: string, value: JsValue): void;
  has(name: string): boolean;
  delete(name: string): boolean;
  clear(): void;
  entries(): [string, string][];
}

export class Request {
  readonly transport: TransportRequest;
  readonly app: Application | undefined;
  body: JsValue | undefined;
  baseUrl: string;
  originalUrl: string;
  params: Params;
  query: Record<string, JsValue>;
  route: Route | undefined;
  readonly method: string;
  readonly path: string;
  readonly protocol: string;
  readonly host: string;
  readonly hostname: string;
  readonly ip: string;
  readonly ips: string[];
  readonly subdomains: string[];
  readonly xhr: boolean;
  readonly secure: boolean;
  readonly stale: boolean;
  get(name: string): string | undefined;
  header(name: string): string | undefined;
  param(name: string): string | undefined;
  setParam(name: string, value: JsValue): void;
  setHeader(name: string, value: string): void;
  entries(): [string, string][];
  accepts(): string[];
  accepts(typeOrTypes: string | string[]): string | false;
  acceptsCharsets(): string[];
  acceptsCharsets(charsetOrCharsets: string | string[]): string | false;
  acceptsEncodings(): string[];
  acceptsEncodings(encodingOrEncodings: string | string[]): string | false;
  acceptsLanguages(): string[];
  acceptsLanguages(languageOrLanguages: string | string[]): string | false;
  is(typeOrTypes: string | string[]): string | false;
  range(size: number, options?: { combine?: boolean }): unknown;
}

export class Response {
  readonly request: Request;
  readonly locals: Record<string, JsValue>;
  readonly headersSent: boolean;
  readonly app: Application | undefined;
  readonly statusCode: number;
  append(field: string, value: string | string[]): this;
  attachment(filename?: string): this;
  clearCookie(name: string, options?: CookieOptions): this;
  contentType(typeName: string): this;
  cookie(name: string, value: JsValue, options?: CookieOptions): this;
  download(path: string, callback?: SendFileCallback): this;
  download(path: string, filename: string, callback?: SendFileCallback): this;
  end(body?: JsValue): this;
  format(handlers: FormatHandlers): this;
  get(field: string): string | undefined;
  header(field: string, value: JsValue): this;
  json(body?: JsValue): this;
  jsonp(body?: JsValue): this;
  links(links: Record<string, string>): this;
  location(path: string): this;
  redirect(path: string): this;
  redirect(status: number, path: string): this;
  render(
    view: string,
    locals?: Record<string, JsValue>,
    callback?: TemplateCallback
  ): this;
  send(body?: JsValue): this;
  sendFile(path: string): this;
  sendFile(path: string, callback: SendFileCallback): this;
  sendFile(path: string, options: Record<string, JsValue>): this;
  sendFile(
    path: string,
    options: Record<string, JsValue>,
    callback: SendFileCallback
  ): this;
  sendStatus(code: number): this;
  set(field: string, value: JsValue): this;
  set(fields: Record<string, JsValue>): this;
  status(code: number): this;
  type(typeName: string): this;
  vary(field: string): this;
}

export class Route {
  all(...handlers: RouteHandler[]): this;
  get(...handlers: RouteHandler[]): this;
  post(...handlers: RouteHandler[]): this;
}

export class Router {
  all(path: PathSpec, ...handlers: RouteHandler[]): this;
  delete(path: PathSpec, ...handlers: RouteHandler[]): this;
  get(name: string): JsValue | undefined;
  get(path: PathSpec, ...handlers: RouteHandler[]): this;
  patch(path: PathSpec, ...handlers: RouteHandler[]): this;
  post(path: PathSpec, ...handlers: RouteHandler[]): this;
  put(path: PathSpec, ...handlers: RouteHandler[]): this;
  method(methodName: string, path: PathSpec, ...handlers: RouteHandler[]): this;
  param(name: string, callback: ParamHandler): this;
  param(name: string[], callback: ParamHandler): this;
  route(path: PathSpec): Route;
  use(first: PathSpec, ...handlers: RequestHandler[]): this;
  use(first: PathSpec, ...handlers: ErrorRequestHandler[]): this;
  use(first: PathSpec, ...routers: Router[]): this;
  use(...handlers: RequestHandler[]): this;
  use(...handlers: ErrorRequestHandler[]): this;
  use(...routers: Router[]): this;
  use_path(path: PathSpec, ...handlers: RequestHandler[]): this;
  use_path_error(path: PathSpec, ...handlers: ErrorRequestHandler[]): this;
  use_path_router(path: PathSpec, ...routers: Router[]): this;
  use_middleware(...handlers: RequestHandler[]): this;
  use_error(...handlers: ErrorRequestHandler[]): this;
  use_router(...routers: Router[]): this;
}

export class Application extends Router {
  readonly locals: Record<string, JsValue>;
  mountpath: string | string[];
  readonly router: Application;
  disable(name: string): this;
  disabled(name: string): boolean;
  enable(name: string): this;
  enabled(name: string): boolean;
  engine(extension: string, callback: TemplateEngine): this;
  handle(context: TransportContext, app?: Application): Promise<void>;
  listen(path: string, callback?: () => void): AppServer;
  listen(port: number, callback?: () => void): AppServer;
  listen(port: number, host: string, callback?: () => void): AppServer;
  listen(
    port: number,
    host: string,
    backlog: number,
    callback?: () => void
  ): AppServer;
  on(eventName: string, listener: (...args: JsValue[]) => void): this;
  path(): string;
  render(
    view: string,
    localsOrCallback?: Record<string, JsValue> | TemplateCallback,
    maybeCallback?: TemplateCallback
  ): void;
  set(name: string, value: JsValue): this;
}

export class AppServer {
  readonly port: number | undefined;
  readonly listening: boolean;
  close(callback?: (error?: Error) => void): void;
}

export class Cookies {
  get(name: string): string | undefined;
  set(name: string, value: string): void;
}

export class Files {
  get(name: string): UploadedFile | undefined;
  set(name: string, file: UploadedFile): void;
}

export class UploadedFile {
  readonly fieldName: string;
  readonly originalName: string;
  readonly mimeType: string;
  readonly size: number;
  text(): string;
  save(path: string): void;
}

export interface RouterOptions {
  caseSensitive?: boolean;
  mergeParams?: boolean;
  strict?: boolean;
}

export type VerifyBodyHandler = (
  req: Request,
  res: Response,
  buffer: Uint8Array,
  encoding?: string
) => void;

export interface JsonOptions {
  inflate?: boolean;
  limit?: string | number;
  reviver?: JsValue;
  strict?: boolean;
  type?: string | string[];
  verify?: VerifyBodyHandler;
}

export interface RawOptions {
  inflate?: boolean;
  limit?: string | number;
  type?: string | string[];
  verify?: VerifyBodyHandler;
}

export interface TextOptions {
  defaultCharset?: string;
  inflate?: boolean;
  limit?: string | number;
  type?: string | string[];
  verify?: VerifyBodyHandler;
}

export interface UrlEncodedOptions {
  depth?: number;
  extended?: boolean;
  inflate?: boolean;
  limit?: string | number;
  parameterLimit?: number;
  type?: string | string[];
  verify?: VerifyBodyHandler;
}

export interface CorsOptions {
  origins?: string[];
  credentials?: boolean;
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  maxAgeSeconds?: number;
  preflightContinue?: boolean;
  optionsSuccessStatus?: number;
}

export interface MultipartField {
  name: string;
  maxCount?: number;
}

export interface MultipartOptions {
  type?: string;
  maxFileCount?: number;
  maxFileSizeBytes?: number;
}

export interface Multipart {
  single(name: string): RequestHandler;
  array(name: string, maxCount?: number): RequestHandler;
  fields(fields: { name: string; maxCount?: number }[]): RequestHandler;
  none(): RequestHandler;
  any(): RequestHandler;
}

export const express: {
  create(): Application;
  app(): Application;
  application(): Application;
  Router(options?: RouterOptions): Router;
  cookieParser(secret: string): RequestHandler;
  cors(options?: CorsOptions): RequestHandler;
  json(options?: JsonOptions): RequestHandler;
  raw(options?: RawOptions): RequestHandler;
  multipart(options?: MultipartOptions): Multipart;
  text(options?: TextOptions): RequestHandler;
  urlencoded(options?: UrlEncodedOptions): RequestHandler;
  dispatch(app: Application, context: TransportContext): Promise<void>;
};

export function dispatch(
  app: Application,
  context: TransportContext
): Promise<void>;
