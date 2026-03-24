import type { Route } from "../route.js";
import type {
  ErrorRequestHandler,
  NextFunction,
  ParamHandler,
  PathSpec,
  RequestHandler,
} from "../types.js";

/**
 * Abstract routing host that provides the full set of HTTP-method helpers
 * (`get`, `post`, `put`, `delete`, etc.) and middleware registration
 * (`use`, `useError`).
 *
 * Concrete implementations (`Router`, `Application`) override the
 * `addRoute`, `addMiddleware`, `addErrorMiddleware`, `createRoute`,
 * and `addParam` hooks.
 *
 * This is the native equivalent of the CLR generic `RoutingHost<TSelf>`.
 * TypeScript doesn't have C#-style CRTP, so methods return `this` directly.
 *
 * NOTE: The existing `Router` class already inlines all these methods.
 * This file exists so that external consumers (and future refactors)
 * can program against the abstract surface without depending on the
 * concrete `Router`.
 */
export interface RoutingHost {
  // HTTP methods ---------------------------------------------------------
  all(path: PathSpec, ...handlers: RequestHandler[]): this;
  delete(path: PathSpec, ...handlers: RequestHandler[]): this;
  get(path: PathSpec, ...handlers: RequestHandler[]): this;
  head?(path: PathSpec, ...handlers: RequestHandler[]): this;
  options?(path: PathSpec, ...handlers: RequestHandler[]): this;
  patch(path: PathSpec, ...handlers: RequestHandler[]): this;
  post(path: PathSpec, ...handlers: RequestHandler[]): this;
  put(path: PathSpec, ...handlers: RequestHandler[]): this;

  // Generic method dispatch ----------------------------------------------
  method(methodName: string, path: PathSpec, ...handlers: RequestHandler[]): this;

  // Middleware ------------------------------------------------------------
  use(
    first: PathSpec | RequestHandler,
    ...rest: RequestHandler[]
  ): this;
  useError(
    handler: ErrorRequestHandler,
    ...handlers: ErrorRequestHandler[]
  ): this;

  // Param handlers -------------------------------------------------------
  param(name: string, callback: ParamHandler): this;
  param(name: string[], callback: ParamHandler): this;

  // Route creation -------------------------------------------------------
  route(path: PathSpec): Route;
}

/**
 * Full list of HTTP methods surfaced by the CLR `RoutingHost`.
 *
 * Useful for generic method dispatch or documentation tooling.
 */
export const HTTP_METHODS: readonly string[] = [
  "ALL",
  "CHECKOUT",
  "COPY",
  "DELETE",
  "GET",
  "HEAD",
  "LOCK",
  "MERGE",
  "MKACTIVITY",
  "MKCOL",
  "MOVE",
  "M-SEARCH",
  "NOTIFY",
  "OPTIONS",
  "PATCH",
  "POST",
  "PURGE",
  "PUT",
  "REPORT",
  "SEARCH",
  "SUBSCRIBE",
  "TRACE",
  "UNLOCK",
  "UNSUBSCRIBE",
] as const;
