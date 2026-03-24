import { unsign } from "../response-cookie-signature.js";
import type { NextFunction, RequestHandler } from "../types.js";
import type { Request } from "../request.js";
import type { Response } from "../response.js";

export function createCookieParser(secret: string): RequestHandler {
  if (secret.trim().length === 0) {
    throw new Error("secret is required.");
  }

  return async (req: Request, _res: Response, next: NextFunction) => {
    if (req.app) {
      req.app.set("cookie secret", secret);
    }

    req.signed = true;

    const toRemove: string[] = [];
    const entries = req.cookies.entries();
    for (let index = 0; index < entries.length; index += 1) {
      const [key, value] = entries[index]!;
      const unsigned = unsign(value, secret);
      if (unsigned === undefined) {
        continue;
      }

      req.signedCookies.set(key, unsigned);
      toRemove.push(key);
    }

    for (let index = 0; index < toRemove.length; index += 1) {
      req.cookies.remove(toRemove[index]!);
    }

    await next(undefined);
  };
}
