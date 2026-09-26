import type { RequestHandler } from "../types.js";

export function createCompressionMiddleware(): RequestHandler {
  return async (req, res, next) => {
    res.vary("Accept-Encoding");
    const selected = req.acceptsEncodings(["br", "gzip", "deflate"]);
    if (selected === "br" || selected === "gzip" || selected === "deflate") {
      res.enableCompression(selected);
    }
    await next();
  };
}
