import { overloads as O } from "@tsonic/core/lang.js";
import type { JsValue } from "@tsonic/core/types.js";
import { Emitter } from "../internal/emitter.js";
import { Router } from "./router.js";
import { AppServer } from "./host/app-server.js";
import { listenOnPath, listenOnPort } from "./host/node-server.js";
import type {
  ParamHandler,
  PathSpec,
  RequestHandler,
  RouteHandler,
  TemplateCallback,
  TemplateEngine
} from "./types.js";
import type { TransportContext } from "./types.js";

export class Application extends Router {
  readonly #events: Emitter = new Emitter();
  readonly #settings: Record<string, JsValue> = {};
  readonly #engines: Record<string, TemplateEngine | undefined> = {};

  readonly locals: Record<string, JsValue> = {};
  mountpath: string | string[] = "/";
  readonly router: Application = this;

  disable(name: string): this {
    this.#settings[name] = false;
    return this;
  }

  disabled(name: string): boolean {
    return readSetting(this.#settings, name) === false;
  }

  enable(name: string): this {
    this.#settings[name] = true;
    return this;
  }

  enabled(name: string): boolean {
    return readSetting(this.#settings, name) === true;
  }

  engine(extension: string, callback: TemplateEngine): this {
    this.#engines[trimLeadingDot(extension)] = callback;
    return this;
  }

  async handle(context: TransportContext, app?: Application): Promise<void> {
    await super.handle(context, app);
  }

  get(name: string): JsValue | undefined;
  override get(path: PathSpec, ...handlers: RouteHandler[]): this;
  override get(
    nameOrPath: string | PathSpec,
    ...handlers: RouteHandler[]
  ): JsValue | undefined | this {
    if (typeof nameOrPath === "string" && handlers.length === 0) {
      return this.get_name(nameOrPath);
    }

    return this.get_route(nameOrPath, ...handlers);
  }

  override get_name(name: string): JsValue | undefined {
    return readSetting(this.#settings, name);
  }

  override get_route(path: PathSpec, ...handlers: RouteHandler[]): this {
    this.addGetRoute(path, handlers);
    return this;
  }

  listen(path: string, callback?: () => void): AppServer;
  listen(port: number, callback?: () => void): AppServer;
  listen(port: number, host: string, callback?: () => void): AppServer;
  listen(
    port: number,
    host: string,
    backlog: number,
    callback?: () => void
  ): AppServer;
  listen(
    portOrPath: string | number,
    hostOrCallback?: string | (() => void),
    backlogOrCallback?: number | (() => void),
    maybeCallback?: () => void
  ): AppServer {
    if (typeof portOrPath === "string") {
      return this.listen_path(
        portOrPath,
        typeof hostOrCallback === "function" ? hostOrCallback : undefined
      );
    }

    if (typeof hostOrCallback === "function" || hostOrCallback === undefined) {
      return this.listen_port(
        portOrPath,
        typeof hostOrCallback === "function" ? hostOrCallback : undefined
      );
    }

    if (
      typeof backlogOrCallback === "function" ||
      backlogOrCallback === undefined
    ) {
      return this.listen_host(
        portOrPath,
        hostOrCallback,
        typeof backlogOrCallback === "function" ? backlogOrCallback : undefined
      );
    }

    return this.listen_backlog(
      portOrPath,
      hostOrCallback,
      backlogOrCallback,
      maybeCallback
    );
  }

  listen_path(path: string, callback?: () => void): AppServer {
    return listenOnPath(this, path, callback);
  }

  listen_port(port: number, callback?: () => void): AppServer {
    return listenOnPort(this, port, callback);
  }

  listen_host(port: number, host: string, callback?: () => void): AppServer {
    return listenOnPort(this, port, host, callback);
  }

  listen_backlog(
    port: number,
    host: string,
    backlog: number,
    callback?: () => void
  ): AppServer {
    return listenOnPort(this, port, host, backlog, callback);
  }

  on(eventName: string, listener: (...args: JsValue[]) => void): this {
    this.#events.on(eventName, listener);
    return this;
  }

  override param(name: string, callback: ParamHandler): this;
  param(name: string[], callback: ParamHandler): this;
  override param(name: string | string[], callback: ParamHandler): this {
    if (Array.isArray(name)) {
      return this.param_names(name, callback);
    }

    return this.param_name(name, callback);
  }

  override param_name(name: string, callback: ParamHandler): this {
    this.addParamHandler(name, callback);
    return this;
  }

  override param_names(name: string[], callback: ParamHandler): this {
    for (let index = 0; index < name.length; index += 1) {
      this.addParamHandler(name[index]!, callback);
    }

    return this;
  }

  path(): string {
    if (typeof this.mountpath === "string") {
      return this.mountpath;
    }

    const mountPaths = this.mountpath as string[];
    let combined = "";
    for (let index = 0; index < mountPaths.length; index += 1) {
      if (index > 0) {
        combined += ",";
      }
      combined += mountPaths[index]!;
    }
    return combined;
  }

  render(
    view: string,
    localsOrCallback?: Record<string, JsValue> | TemplateCallback,
    maybeCallback?: TemplateCallback
  ): void {
    const locals = typeof localsOrCallback === "function" || localsOrCallback === undefined ? this.locals : localsOrCallback;
    const callback: TemplateCallback | undefined =
      typeof localsOrCallback === "function" ? localsOrCallback : maybeCallback;
    if (!callback) {
      throw new Error("render callback is required");
    }

    const engine = this.resolveEngine(view);
    if (!engine) {
      callback(null, `<rendered:${view}>`);
      return;
    }

    engine(view, locals, callback);
  }

  set(name: string, value: JsValue): this {
    this.#settings[name] = value;
    return this;
  }

  override use(
    first: PathSpec | RequestHandler | Router,
    ...rest: Array<RequestHandler | Router>
  ): this {
    if (isPathSpec(first)) {
      this.addMiddlewareLayer(first, rest);
      this.mountApplications(first, rest);
      return this;
    }

    return this.useRootApplicationMiddleware(first, rest);
  }

  private mountApplications(
    mountedAt: PathSpec,
    candidates: readonly (RequestHandler | Router)[]
  ): void {
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]!;
      if (typeof candidate === "function") {
        continue;
      }
      if (candidate instanceof Application) {
        candidate.mountpath = typeof mountedAt === "string" ? mountedAt : "/";
        candidate.#events.emit("mount", this);
      }
    }
  }

  private useRootApplicationMiddleware(
    first: RequestHandler | Router,
    rest: readonly (RequestHandler | Router)[]
  ): this {
    const handlers: Array<RequestHandler | Router> = [first, ...rest];
    this.addMiddlewareLayer("/", handlers);
    this.mountApplications("/", handlers);
    return this;
  }

  resolveEngine(view: string): TemplateEngine | undefined {
    const dotIndex = view.lastIndexOf(".");
    const extension = dotIndex >= 0 ? view.slice(dotIndex + 1) : "";
    return readEngine(this.#engines, extension);
  }
}

function isPathSpec(value: JsValue): value is PathSpec {
  if (typeof value === "string" || value instanceof RegExp) {
    return true;
  }

  if (!Array.isArray(value)) {
    return false;
  }

  const items = value as readonly JsValue[];
  for (let index = 0; index < items.length; index += 1) {
    if (!isPathSpec(items[index])) {
      return false;
    }
  }

  return true;
}

function trimLeadingDot(value: string): string {
  if (value.startsWith(".")) {
    return value.slice(1);
  }

  return value;
}

function readSetting(
  settings: Record<string, JsValue>,
  name: string
): JsValue | undefined {
  for (const currentKey in settings) {
    if (currentKey === name) {
      return settings[currentKey];
    }
  }

  return undefined;
}

function readEngine(
  engines: Record<string, TemplateEngine | undefined>,
  extension: string
): TemplateEngine | undefined {
  for (const currentKey in engines) {
    if (currentKey === extension) {
      return engines[currentKey];
    }
  }

  return undefined;
}

O<Application>().method(x => x.get_name).family(x => x.get);
O<Application>().method(x => x.get_route).family(x => x.get);
O<Application>().method(x => x.listen_path).family(x => x.listen);
O<Application>().method(x => x.listen_port).family(x => x.listen);
O<Application>().method(x => x.listen_host).family(x => x.listen);
O<Application>().method(x => x.listen_backlog).family(x => x.listen);
O<Application>().method(x => x.param_name).family(x => x.param);
O<Application>().method(x => x.param_names).family(x => x.param);
