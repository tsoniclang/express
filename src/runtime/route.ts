import type { Router } from "./router.js";
import type { PathSpec, RouteHandler } from "./types.js";

export class Route {
  readonly #router: Router;
  readonly #path: PathSpec;

  constructor(router: Router, path: PathSpec) {
    this.#router = router;
    this.#path = path;
  }

  all(...handlers: RouteHandler[]): this {
    this.#router.addRouteLayer(null, this.#path, handlers);
    return this;
  }

  get(...handlers: RouteHandler[]): this {
    this.#router.addRouteLayer("GET", this.#path, handlers);
    return this;
  }

  post(...handlers: RouteHandler[]): this {
    this.#router.addRouteLayer("POST", this.#path, handlers);
    return this;
  }
}
