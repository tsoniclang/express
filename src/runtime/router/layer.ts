import type { PathSpec } from "../types.js";

/**
 * Internal layer descriptor used by the router to store registered
 * routes and middleware.
 *
 * This is the native equivalent of the CLR `layer` class.  The actual
 * matching / dispatch logic lives in `Router` — this type is a pure
 * data holder.
 */
export interface Layer {
  /** Path pattern this layer matches against. */
  readonly path: PathSpec;
  /** HTTP method in uppercase (`"GET"`, `"POST"`, etc.) or `null` for "all". */
  readonly method: string | null;
  /** `true` when this layer is middleware rather than a terminal route. */
  readonly middleware: boolean;
  /** Ordered list of handlers attached to this layer. */
  readonly handlers: readonly unknown[];
}

/**
 * Create a new `Layer` value.
 */
export function createLayer(
  path: PathSpec,
  method: string | null,
  middleware: boolean,
  handlers: readonly unknown[]
): Layer {
  return {
    path,
    method,
    middleware,
    handlers: [...handlers],
  };
}
