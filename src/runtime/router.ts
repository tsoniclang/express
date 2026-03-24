import { Request } from "./request.js";
import { Response } from "./response.js";
import { Route } from "./route.js";
import { Params } from "./params.js";
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
  control?: string | null;
  error?: unknown;
};

type MiddlewareLike = RequestHandler | Router;
type MiddlewareHandler = RequestHandler | ErrorRequestHandler;

class RouteLayer {
  constructor(
    readonly path: PathSpec,
    readonly method: string | null,
    readonly middleware: boolean,
    readonly handlers: MiddlewareHandler[],
    readonly handlesError: boolean
  ) {}

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

  get(name: string): unknown;
  get(path: PathSpec, ...handlers: RouteHandler[]): this;
  get(nameOrPath: string | PathSpec, ...handlers: RouteHandler[]): this | undefined {
    if (handlers.length === 0 && typeof nameOrPath === "string") {
      return undefined;
    }

    this.addRouteLayer("GET", nameOrPath as PathSpec, handlers);
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
      for (let index = 0; index < name.length; index += 1) {
        const item = name[index]!;
        this.param(item, callback);
      }
      return this;
    }

    const key = name.toLowerCase();
    const handlers = readParamHandlers(this.#paramHandlers, key) ?? [];
    handlers.push(callback);
    this.#paramHandlers[key] = handlers;
    return this;
  }

  route(path: PathSpec): Route {
    return new Route(this, path);
  }

  use(first: PathSpec | MiddlewareLike, ...rest: MiddlewareLike[]): this {
    if (isPathSpec(first)) {
      this.addMiddlewareLayer(first, rest);
      return this;
    }

    return this.useRootMiddleware(first, rest);
  }

  useError(
    handler: ErrorRequestHandler,
    ...handlers: ErrorRequestHandler[]
  ): this {
    this.addErrorMiddlewareLayer("/", [handler, ...handlers]);
    return this;
  }

  addRouteLayer(method: string | null, path: PathSpec, handlers: readonly unknown[]): void {
    this.#layers.push(
      new RouteLayer(
        path,
        method,
        false,
        flattenRouteHandlers(handlers),
        false
      )
    );
  }

  addMiddlewareLayer(path: PathSpec, handlers: readonly unknown[]): void {
    for (const handler of flattenMiddlewareEntries(handlers)) {
      if (handler instanceof Router) {
        for (const exported of handler.export(path)) {
          this.#layers.push(exported);
        }
        continue;
      }

      this.#layers.push(new RouteLayer(path, null, true, [handler], false));
    }
  }

  addErrorMiddlewareLayer(
    path: PathSpec,
    handlers: readonly unknown[]
  ): void {
    for (const handler of flattenErrorMiddlewareEntries(handlers)) {
      this.#layers.push(new RouteLayer(path, null, true, [handler], true));
    }
  }

  export(mountPath: PathSpec): RouteLayer[] {
    return this.#layers.map((layer) => layer.mountedAt(mountPath));
  }

  async handle(context: TransportContext, app?: Application): Promise<void> {
    const request = new Request(context.request, app);
    const response = new Response(context.response, request);
    const processedParams: Record<string, true | undefined> = {};
    let currentError: unknown = undefined;

    for (const layer of this.#layers) {
      const extractedParams = new Params();
      if (!matchesLayer(layer, request.path, extractedParams)) {
        continue;
      }

      if (typeof layer.path === "string") {
        request.baseUrl = layer.path === "/" ? "" : normalizePath(layer.path);
      }

      if (!layer.middleware && layer.method && layer.method !== request.method.toUpperCase()) {
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
      if (control.error !== undefined) {
        currentError = control.error;
      }

      if (control.ended || response.headersSent) {
        return;
      }

      if (control.control === "router") {
        return;
      }

      if (control.control === "route") {
        continue;
      }
    }
  }

  private async runParamHandlers(
    request: Request,
    response: Response,
    processedParams: Record<string, true | undefined>
  ): Promise<void> {
    for (const [key, value] of request.entries()) {
      const dedupeKey = `${key}:${value}`;
      if (readProcessedParam(processedParams, dedupeKey)) {
        continue;
      }

      processedParams[dedupeKey] = true;
      const handlers = readParamHandlers(this.#paramHandlers, key.toLowerCase());
      if (!handlers) {
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

function flattenRouteHandlers(handlers: readonly unknown[]): RouteHandler[] {
  const result: RouteHandler[] = [];

  for (const handler of handlers) {
    if (typeof handler !== "function") {
      throw new Error("route handlers must be functions");
    }

    result.push(handler as RouteHandler);
  }

  return result;
}

function flattenMiddlewareEntries(
  handlers: readonly unknown[]
): MiddlewareLike[] {
  const result: MiddlewareLike[] = [];

  for (const handler of handlers) {
    if (handler instanceof Router) {
      result.push(handler as Router);
      continue;
    }

    if (typeof handler !== "function") {
      throw new Error("middleware handlers must be functions");
    }

    result.push(handler as RequestHandler);
  }

  return result;
}

function flattenErrorMiddlewareEntries(
  handlers: readonly unknown[]
): ErrorRequestHandler[] {
  const result: ErrorRequestHandler[] = [];

  for (const handler of handlers) {
    if (typeof handler !== "function") {
      throw new Error("error middleware handlers must be functions");
    }
    result.push(handler as ErrorRequestHandler);
  }

  return result;
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
  if (pathSpec == null) {
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

function isPathSpec(value: unknown): value is PathSpec {
  if (value == null || typeof value === "string" || value instanceof RegExp) {
    return true;
  }

  if (!Array.isArray(value)) {
    return false;
  }

  const items = value as readonly unknown[];
  for (let index = 0; index < items.length; index += 1) {
    if (!isPathSpec(items[index])) {
      return false;
    }
  }

  return true;
}

function isMiddlewareHandler(handler: unknown): handler is MiddlewareHandler {
  return typeof handler === "function";
}

async function invokeHandlers(
  handlers: readonly MiddlewareHandler[],
  request: Request,
  response: Response,
  currentError: unknown,
  treatAsError: boolean
): Promise<HandlerControl> {
  let error: unknown = currentError;

  for (let index = 0; index < handlers.length; index += 1) {
    const entry = handlers[index]!;
    let nextCalled = false;
    let control: NextControl = undefined;

    const next = async (value?: NextControl): Promise<void> => {
      nextCalled = true;
      control = value;
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
        await (entry as ErrorRequestHandler)(error, request, response, next);
      }

      if (nextCalled) {
        if (typeof control === "string" && control !== "") {
          return { ended: false, control, error: undefined };
        }

        if (treatAsError) {
          error = undefined;
        }
        continue;
      }

      return { ended: true };
    } catch (thrownError) {
      error = thrownError;
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
  return value;
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
