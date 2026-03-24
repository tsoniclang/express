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
  readonly #settings: Record<string, unknown> = {};
  readonly #engines: Record<string, TemplateEngine | undefined> = {};

  readonly locals: Record<string, unknown> = {};
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

  get(name: string): unknown;
  override get(path: PathSpec, ...handlers: RouteHandler[]): this;
  override get(nameOrPath: string | PathSpec, ...handlers: RouteHandler[]): unknown {
    if (handlers.length === 0 && typeof nameOrPath === "string") {
      return readSetting(this.#settings, nameOrPath);
    }

    return super.get(nameOrPath as PathSpec, ...handlers);
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
    portOrPath: number | string,
    hostOrCallback?: string | (() => void),
    backlogOrCallback?: number | (() => void),
    maybeCallback?: () => void
  ): AppServer {
    if (typeof portOrPath === "string") {
      const callback =
        typeof hostOrCallback === "function" ? hostOrCallback : maybeCallback;
      return listenOnPath(this, portOrPath, callback);
    }

    if (typeof hostOrCallback === "string") {
      if (typeof backlogOrCallback === "number") {
        return listenOnPort(
          this,
          portOrPath,
          hostOrCallback,
          backlogOrCallback,
          maybeCallback
        );
      }

      return listenOnPort(
        this,
        portOrPath,
        hostOrCallback,
        typeof backlogOrCallback === "function"
          ? backlogOrCallback
          : maybeCallback
      );
    }

    if (typeof hostOrCallback === "function") {
      return listenOnPort(this, portOrPath, hostOrCallback);
    }

    if (typeof backlogOrCallback === "function") {
      return listenOnPort(this, portOrPath, backlogOrCallback);
    }

    return listenOnPort(this, portOrPath, maybeCallback);
  }

  on(eventName: string, listener: (...args: unknown[]) => void): this {
    this.#events.on(eventName, listener);
    return this;
  }

  override param(name: string, callback: ParamHandler): this;
  param(name: string[], callback: ParamHandler): this;
  override param(name: string | string[], callback: ParamHandler): this {
    if (Array.isArray(name)) {
      for (let index = 0; index < name.length; index += 1) {
        const item = name[index]!;
        super.param(item, callback);
      }
      return this;
    }

    super.param(name, callback);
    return this;
  }

  path(): string {
    if (typeof this.mountpath === "string") {
      return this.mountpath;
    }

    let combined = "";
    for (let index = 0; index < this.mountpath.length; index += 1) {
      if (index > 0) {
        combined += ",";
      }
      combined += this.mountpath[index]!;
    }
    return combined;
  }

  render(
    view: string,
    localsOrCallback?: Record<string, unknown> | TemplateCallback,
    maybeCallback?: TemplateCallback
  ): void {
    const locals = typeof localsOrCallback === "function" || localsOrCallback === undefined ? this.locals : localsOrCallback;
    const callback = typeof localsOrCallback === "function" ? localsOrCallback : maybeCallback;
    if (!callback) {
      throw new Error("render callback is required");
    }

    const engine = this.resolveEngine(view);
    if (!engine) {
      callback(undefined, `<rendered:${view}>`);
      return;
    }

    engine(view, locals, callback);
  }

  set(name: string, value: unknown): this {
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

function trimLeadingDot(value: string): string {
  if (value.startsWith(".")) {
    return value.slice(1);
  }

  return value;
}

function readSetting(
  settings: Record<string, unknown>,
  name: string
): unknown {
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
