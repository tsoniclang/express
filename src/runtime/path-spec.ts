import type { Router } from "./router.js";
import type { ErrorRequestHandler, PathSpec, RequestHandler } from "./types.js";

export function isPathSpec(value: PathSpec | RequestHandler | ErrorRequestHandler | Router): value is PathSpec {
  if (typeof value === "string" || value instanceof RegExp) return true;
  return Array.isArray(value);
}
