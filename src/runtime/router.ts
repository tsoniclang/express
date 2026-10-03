import { Request } from "./request.js";
import { Response } from "./response.js";
import { Route } from "./route.js";
import { Params } from "./params.js";
import { decodePercentEncoded } from "./percent-decoding.js";
import { isPathSpec } from "./path-spec.js";
import type { Application } from "./application.js";
import type {
  ErrorRequestHandler,
  NextControl,
  PathSpec,
  ParamHandler,
  RequestHandler,
  RouteHandler,
  TransportContext
} from "./types.js";

type HandlerControl = {
  ended: boolean;
  control?: "route" | "router";
  error?: { value: unknown };
};

type MiddlewareLike = RequestHandler | Router;
type MiddlewareHandler = RequestHandler | ErrorRequestHandler;

class RouteLayer {
  readonly path: PathSpec;
  readonly method: string | null;
  readonly middleware: boolean;
  readonly handlers: MiddlewareHandler[];
  readonly handlesError: boolean;

  constructor(
    path: PathSpec,
    method: string | null,
    middleware: boolean,
    handlers: MiddlewareHandler[],
    handlesError: boolean
  ) {
    this.path = path;
    this.method = method;
    this.middleware = middleware;
    this.handlers = handlers;
    this.handlesError = handlesError;
  }

  mountedAt(path: PathSpec): RouteLayer {
    return new RouteLayer(
      combinePath(path, this.path),
      this.method,
      this.middleware,
      [...this.handlers],
      this.handlesError
    );
  }
}

export class Router {
  readonly #layers: RouteLayer[] = [];
  readonly #paramHandlers: Record<string, ParamHandler[] | undefined> = {};

  all(path: PathSpec, ...handlers: RouteHandler[]): this {
    this.addRouteLayer(null, path, handlers);
    return this;
  }

  delete(path: PathSpec, ...handlers: RouteHandler[]): this {
    this.addRouteLayer("DELETE", path, handlers);
    return this;
  }

  get(name: string): unknown | undefined;
  get(path: PathSpec, ...handlers: RouteHandler[]): this;
  get(
    nameOrPath: string | PathSpec,
    ...handlers: RouteHandler[]
  ): unknown | undefined | this {
    if (typeof nameOrPath === "string" && handlers.length === 0) {
      return this.get_name(nameOrPath);
    }

    return this.get_route(nameOrPath, ...handlers);
  }

  get_name(_name: string): unknown | undefined {
    return undefined;
  }

  get_route(path: PathSpec, ...handlers: RouteHandler[]): this {
    return this.addGetRoute(path, handlers);
  }

  protected addGetRoute(
    path: PathSpec,
    handlers: readonly RouteHandler[]
  ): this {
    this.addRouteLayer("GET", path, handlers);
    return this;
  }

  patch(path: PathSpec, ...handlers: RouteHandler[]): this {
    this.addRouteLayer("PATCH", path, handlers);
    return this;
  }

  post(path: PathSpec, ...handlers: RouteHandler[]): this {
    this.addRouteLayer("POST", path, handlers);
    return this;
  }

  put(path: PathSpec, ...handlers: RouteHandler[]): this {
    this.addRouteLayer("PUT", path, handlers);
    return this;
  }

  method(methodName: string, path: PathSpec, ...handlers: RouteHandler[]): this {
    this.addRouteLayer(methodName.trim().toUpperCase(), path, handlers);
    return this;
  }

  param(name: string, callback: ParamHandler): this;
  param(name: string[], callback: ParamHandler): this;
  param(name: string | string[], callback: ParamHandler): this {
    if (Array.isArray(name)) {
      return this.param_names(name, callback);
    }

    return this.param_name(name, callback);
  }

  param_name(name: string, callback: ParamHandler): this {
    return this.addParamHandler(name, callback);
  }

  protected addParamHandler(name: string, callback: ParamHandler): this {
    const key = name.toLowerCase();
    const handlers = readParamHandlers(this.#paramHandlers, key) ?? [];
    handlers.push(callback);
    this.#paramHandlers[key] = handlers;
    return this;
  }

  param_names(name: string[], callback: ParamHandler): this {
    for (let index = 0; index < name.length; index += 1) {
      const item = name[index]!;
      this.param_name(item, callback);
    }

    return this;
  }

  route(path: PathSpec): Route {
    return new Route(this, path);
  }

  use(first: PathSpec, ...rest: RequestHandler[]): this;
  use(first: PathSpec, ...rest: Router[]): this;
  use(...handlers: RequestHandler[]): this;
  use(...routers: Router[]): this;
  use(first: PathSpec | MiddlewareLike, ...rest: MiddlewareLike[]): this {
    if (isPathSpec(first)) {
      this.addMiddlewareLayer(first, [...rest]);
      return this;
    }

    return this.useRootMiddleware(first, rest);
  }

  use_path(path: PathSpec, ...handlers: RequestHandler[]): this {
    this.addMiddlewareLayer(path, [...handlers]);
    return this;
  }

  useError(path: PathSpec, ...handlers: ErrorRequestHandler[]): this;
  useError(...handlers: ErrorRequestHandler[]): this;
  useError(first: PathSpec | ErrorRequestHandler, ...rest: ErrorRequestHandler[]): this {
    if (isPathSpec(first)) {
      this.addMiddlewareLayer(first, [...rest], true);
    } else {
      this.addMiddlewareLayer("/", [first, ...rest], true);
    }
    return this;
  }

  use_path_router(path: PathSpec, ...routers: Router[]): this {
    this.addMiddlewareLayer(path, [...routers]);
    return this;
  }

  use_middleware(...handlers: RequestHandler[]): this {
    this.addMiddlewareLayer("/", [...handlers]);
    return this;
  }

  use_router(...routers: Router[]): this {
    this.addMiddlewareLayer("/", [...routers]);
    return this;
  }

  addRouteLayer(method: string | null, path: PathSpec, handlers: readonly RouteHandler[]): void {
    this.#layers.push(
      new RouteLayer(
        path,
        method,
        false,
        [...handlers],
        false
      )
    );
  }

  addMiddlewareLayer(path: PathSpec, handlers: readonly (MiddlewareLike | ErrorRequestHandler)[], handlesError = false): void {
    for (const handler of handlers) {
      if (handler instanceof Router) {
        for (const exported of handler.export(path)) {
          this.#layers.push(exported);
        }
        continue;
      }

      const middlewareHandler = handler as MiddlewareHandler;
      this.#layers.push(
        new RouteLayer(
          path,
          null,
          true,
          [middlewareHandler],
          handlesError
        )
      );
    }
  }

  export(mountPath: PathSpec): RouteLayer[] {
    return this.#layers.map((layer) => layer.mountedAt(mountPath));
  }

  async handle(context: TransportContext, app?: Application): Promise<void> {
    const request = new Request(context.request, app);
    const response = new Response(context.response, request);
    const processedParams: Record<string, true | undefined> = {};
    let currentError: { value: unknown } | undefined;

    for (const layer of this.#layers) {
      const extractedParams = new Params();
      if (!matchesLayer(layer, request.path, extractedParams)) {
        continue;
      }

      if (typeof layer.path === "string") {
        request.baseUrl = layer.path === "/" ? "" : normalizePath(layer.path);
      }

      if (!layer.middleware && layer.method !== null && layer.method.length !== 0 &&
          layer.method !== request.method.toUpperCase()) {
        continue;
      }

      for (const [key, value] of extractedParams.entries()) {
        request.setParam(key, value);
      }

      if (!layer.middleware) {
        request.route = new Route(this, layer.path);
      }

      await this.runParamHandlers(request, response, processedParams);

      const control = await invokeHandlers(
        layer.handlers,
        request,
        response,
        currentError,
        layer.handlesError
      );
      currentError = control.error;

      if (control.ended || response.headersSent) {
        await response.completion;
        return;
      }

      if (control.control === "router") {
        return;
      }

      if (control.control === "route") {
        continue;
      }
    }

    if (currentError !== undefined) throw currentError.value;
  }

  private async runParamHandlers(
    request: Request,
    response: Response,
    processedParams: Record<string, true | undefined>
  ): Promise<void> {
    for (const [key, value] of request.entries()) {
      const dedupeKey = `${key}:${value}`;
      if (readProcessedParam(processedParams, dedupeKey) === true) {
        continue;
      }

      processedParams[dedupeKey] = true;
      const handlers = readParamHandlers(this.#paramHandlers, key.toLowerCase());
      if (handlers === undefined) {
        continue;
      }

      for (let index = 0; index < handlers.length; index += 1) {
        const handler = handlers[index]!;
        await handler(request, response, () => undefined, value, key);
      }
    }
  }

  private useRootMiddleware(
    first: MiddlewareLike,
    rest: readonly MiddlewareLike[]
  ): this {
    this.addMiddlewareLayer("/", [first, ...rest]);
    return this;
  }
}

function combinePath(left: PathSpec, right: PathSpec): PathSpec {
  if (typeof left !== "string" || typeof right !== "string") {
    return right;
  }

  const lhs = trimTrailingSlashes(left);
  const rhs = trimLeadingSlashes(right);
  if (lhs.length === 0 || lhs === "/") {
    return `/${rhs}`;
  }

  if (rhs.length === 0) {
    return lhs;
  }

  return `${lhs}/${rhs}`;
}

function matchesLayer(layer: RouteLayer, requestPath: string, parameters: Params): boolean {
  return matchesPathSpec(layer.path, requestPath, layer.middleware, parameters);
}

function matchesPathSpec(
  pathSpec: PathSpec,
  requestPath: string,
  middleware: boolean,
  parameters: Params
): boolean {
  if (pathSpec === null || pathSpec === undefined) {
    return true;
  }

  if (typeof pathSpec === "string") {
    return matchesStringPath(pathSpec, requestPath, middleware, parameters);
  }

  if (pathSpec instanceof RegExp) {
    return pathSpec.test(requestPath);
  }

  if (Array.isArray(pathSpec)) {
    for (let index = 0; index < pathSpec.length; index += 1) {
      if (matchesPathSpec(pathSpec[index]!, requestPath, middleware, parameters)) {
        return true;
      }
    }
    return false;
  }

  return false;
}

function matchesStringPath(pathSpec: string, requestPath: string, middleware: boolean, parameters: Params): boolean {
  const normalizedPath = normalizePath(requestPath);
  const normalizedSpec = normalizePath(pathSpec);

  if (normalizedSpec === "/" || normalizedSpec.length === 0) {
    return middleware || normalizedPath === "/";
  }

  if (normalizedSpec.includes("{*splat}")) {
    return normalizedPath.startsWith(normalizedSpec.replace("{*splat}", ""));
  }

  if (normalizedSpec.includes(":")) {
    return matchColonParams(normalizedSpec, normalizedPath, middleware, parameters);
  }

  if (middleware) {
    return normalizedPath === normalizedSpec || normalizedPath.startsWith(`${normalizedSpec}/`);
  }

  return normalizedPath === normalizedSpec;
}

function matchColonParams(
  pattern: string,
  value: string,
  middleware: boolean,
  parameters: Params
): boolean {
  const patternParts = splitPathParts(pattern);
  const valueParts = splitPathParts(value);

  if (!middleware && patternParts.length !== valueParts.length) {
    return false;
  }

  if (middleware && patternParts.length > valueParts.length) {
    return false;
  }

  for (let index = 0; index < patternParts.length; index += 1) {
    const patternPart = patternParts[index]!;
    const valuePart = valueParts[index]!;

    if (patternPart.startsWith(":")) {
      parameters.set(patternPart.slice(1), decodePathValue(valuePart));
      continue;
    }

    if (patternPart.toLowerCase() !== valuePart.toLowerCase()) {
      return false;
    }
  }

  return true;
}

function normalizePath(path: string): string {
  if (path.trim().length === 0) {
    return "/";
  }

  let normalized = path;
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  if (normalized.length > 1) {
    normalized = trimTrailingSlashes(normalized);
  }

  return normalized;
}

async function invokeHandlers(
  handlers: readonly MiddlewareHandler[],
  request: Request,
  response: Response,
  currentError: { value: unknown } | undefined,
  treatAsError: boolean
): Promise<HandlerControl> {
  let error = currentError;

  for (let index = 0; index < handlers.length; index += 1) {
    const entry = handlers[index]!;
    let nextCalled = false;
    let control: NextControl = undefined;

    const next = (value?: NextControl): Promise<void> => {
      nextCalled = true;
      control = value;
      return Promise.resolve(undefined);
    };

    try {
      if (error === undefined) {
        if (treatAsError) {
          continue;
        }
        await (entry as RequestHandler)(request, response, next);
      } else {
        if (!treatAsError) {
          continue;
        }
        await (entry as ErrorRequestHandler)(error.value, request, response, next);
      }

      if (nextCalled) {
        if (control === "route" || control === "router") {
          return { ended: false, control, error: undefined };
        }

        if (control !== undefined && control !== null && control !== "") {
          error = { value: control };
          continue;
        }

        if (treatAsError) {
          error = undefined;
        }
        continue;
      }

      return { ended: true };
    } catch (thrownError) {
      error = { value: thrownError };
    }
  }

  return { ended: false, error };
}

function trimLeadingSlashes(value: string): string {
  let index = 0;
  while (index < value.length && value[index] === "/") {
    index += 1;
  }
  return value.slice(index);
}

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 1 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
}

function splitPathParts(value: string): string[] {
  const trimmed = trimLeadingSlashes(trimTrailingSlashes(value));
  if (trimmed.length === 0) {
    return [];
  }

  const rawParts = trimmed.split("/");
  const result: string[] = [];
  for (let index = 0; index < rawParts.length; index += 1) {
    const part = rawParts[index]!;
    if (part.length > 0) {
      result.push(part);
    }
  }
  return result;
}

function decodePathValue(value: string): string {
  try {
    return decodePercentEncoded(value);
  } catch {
    return value;
  }
}

function readParamHandlers(
  paramHandlers: Record<string, ParamHandler[] | undefined>,
  key: string
): ParamHandler[] | undefined {
  for (const currentKey in paramHandlers) {
    if (currentKey === key) {
      return paramHandlers[currentKey];
    }
  }

  return undefined;
}

function readProcessedParam(
  processedParams: Record<string, true | undefined>,
  key: string
): true | undefined {
  for (const currentKey in processedParams) {
    if (currentKey === key) {
      return processedParams[currentKey];
    }
  }

  return undefined;
}
