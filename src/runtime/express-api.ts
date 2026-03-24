import { Application } from "./application.js";
import { Router } from "./router.js";
import { Multipart } from "./middleware/multipart.js";
import { createCookieParser } from "./middleware/cookie-parser.js";
import { createCorsMiddleware } from "./middleware/cors.js";
import {
  createJsonMiddleware,
  createRawMiddleware,
  createTextMiddleware,
  createUrlEncodedMiddleware
} from "./middleware/body-parsers.js";
import type {
  CorsOptions,
  JsonOptions,
  MultipartOptions,
  RawOptions,
  RouterOptions,
  TextOptions,
  UrlEncodedOptions
} from "./options.js";
import type { TransportContext } from "./types.js";

export const express = {
  create(): Application {
    return new Application();
  },
  app(): Application {
    return new Application();
  },
  application(): Application {
    return new Application();
  },
  Router(_options?: RouterOptions): Router {
    return new Router();
  },
  cookieParser(secret: string) {
    return createCookieParser(secret);
  },
  cors(options?: CorsOptions) {
    return createCorsMiddleware(options);
  },
  json(options?: JsonOptions) {
    return createJsonMiddleware(options);
  },
  raw(options?: RawOptions) {
    return createRawMiddleware(options);
  },
  multipart(options?: MultipartOptions): Multipart {
    return new Multipart(options);
  },
  text(options?: TextOptions) {
    return createTextMiddleware(options);
  },
  urlencoded(options?: UrlEncodedOptions) {
    return createUrlEncodedMiddleware(options);
  },
  async dispatch(app: Application, context: TransportContext): Promise<void> {
    await app.handle(context, app);
  }
};
