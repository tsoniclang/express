import type { CorsOptions } from "../options.js";
import type { NextFunction, RequestHandler } from "../types.js";
import type { Request } from "../request.js";
import type { Response } from "../response.js";

export function createCorsMiddleware(options?: CorsOptions): RequestHandler {
  const resolved = options ?? {};

  return async (req: Request, res: Response, next: NextFunction) => {
    const origin = req.get("origin");
    if (!origin || origin.trim().length === 0) {
      await next(undefined);
      return undefined;
    }

    const configuredOrigins = resolved.origins;
    const allowAny =
      configuredOrigins === undefined || configuredOrigins.length === 0;
    if (!allowAny && !includesOrigin(configuredOrigins, origin)) {
      await next(undefined);
      return undefined;
    }

    const allowOrigin =
      allowAny && !resolved.credentials ? "*" : origin;
    res.set("Access-Control-Allow-Origin", allowOrigin);
    if (allowOrigin !== "*") {
      res.vary("Origin");
    }

    if (resolved.credentials) {
      res.set("Access-Control-Allow-Credentials", "true");
    }

    if (resolved.exposedHeaders && resolved.exposedHeaders.length > 0) {
      res.set(
        "Access-Control-Expose-Headers",
        resolved.exposedHeaders.join(", ")
      );
    }

    if (req.method.toUpperCase() === "OPTIONS") {
      if (resolved.methods && resolved.methods.length > 0) {
        res.set("Access-Control-Allow-Methods", resolved.methods.join(", "));
      } else {
        const requestedMethod = req.get("access-control-request-method");
        res.set(
          "Access-Control-Allow-Methods",
          requestedMethod && requestedMethod.trim().length > 0
            ? requestedMethod
            : "GET, HEAD, PUT, PATCH, POST, DELETE"
        );
      }

      if (resolved.allowedHeaders && resolved.allowedHeaders.length > 0) {
        res.set(
          "Access-Control-Allow-Headers",
          resolved.allowedHeaders.join(", ")
        );
      } else {
        const requestedHeaders = req.get("access-control-request-headers");
        if (requestedHeaders && requestedHeaders.trim().length > 0) {
          res.set("Access-Control-Allow-Headers", requestedHeaders);
        }
      }

      if (resolved.maxAgeSeconds && resolved.maxAgeSeconds > 0) {
        res.set("Access-Control-Max-Age", String(resolved.maxAgeSeconds));
      }

      if (!resolved.preflightContinue) {
        res.status(resolved.optionsSuccessStatus ?? 204).end();
        return undefined;
      }
    }

    await next(undefined);
    return undefined;
  };
}

function includesOrigin(candidates: readonly string[], origin: string): boolean {
  const expected = origin.toLowerCase();
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    if (candidate.toLowerCase() === expected) {
      return true;
    }
  }

  return false;
}
