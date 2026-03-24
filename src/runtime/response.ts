import type { Application } from "./application.js";
import { sign } from "./response-cookie-signature.js";
import type { Request } from "./request.js";
import type { TemplateCallback, TransportResponse } from "./types.js";

export interface CookieOptions {
  encode?: (value: string) => string;
  expires?: Date;
  path?: string;
  domain?: string;
  httpOnly?: boolean;
  secure?: boolean;
  partitioned?: boolean;
  sameSite?: string | boolean;
  priority?: string;
  maxAge?: number;
  signed?: boolean;
}

export class Response {
  readonly #transport: TransportResponse;
  readonly #headers: Record<string, string> = {};
  #statusCode: number = 200;

  req?: Request;
  readonly locals: Record<string, unknown> = {};
  headersSent: boolean = false;

  constructor(transport: TransportResponse, request?: Request) {
    this.#transport = transport;
    this.req = request;
    if (request) {
      request.res = this;
    }
    this.#statusCode = transport.statusCode;
  }

  get app(): Application | undefined {
    return this.req?.app;
  }

  get statusCode(): number {
    return this.#statusCode;
  }

  set statusCode(value: number) {
    this.#statusCode = value;
    this.#transport.statusCode = value;
  }

  append(field: string, value: string): this;
  append(field: string, value: string[]): this;
  append(field: string, value: string | string[]): this {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const item = value[index]!;
        this.append(field, item);
      }

      return this;
    }

    const key = field.toLowerCase();
    const current = readHeader(this.#headers, key);
    const next = current ? `${current}, ${value}` : value;
    this.#headers[key] = next;
    this.#transport.appendHeader(field, value);
    return this;
  }

  cookie(name: string, value: unknown, options?: CookieOptions): this {
    let payload = typeof value === "string" ? value : JSON.stringify(value);
    if (options?.signed) {
      const secret =
        typeof this.app?.get("cookie secret") === "string"
          ? String(this.app?.get("cookie secret"))
          : undefined;
      if (!secret) {
        throw new Error(
          "Cannot set signed cookie without a secret. Install cookieParser() first."
        );
      }

      payload = sign(payload, secret);
    }

    const encoded = options?.encode ? options.encode(payload) : payload;
    const segments = [`${name}=${encoded}`, `Path=${options?.path ?? "/"}`];

    if (options?.domain) {
      segments.push(`Domain=${options.domain}`);
    }

    if (typeof options?.maxAge === "number") {
      let maxAgeSeconds = options.maxAge - (options.maxAge % 1000);
      if (maxAgeSeconds < 0) {
        maxAgeSeconds = 0;
      }
      segments.push(`Max-Age=${String(maxAgeSeconds / 1000)}`);
    }

    if (options?.expires) {
      segments.push(`Expires=${options.expires.toUTCString()}`);
    }

    if (options?.httpOnly) {
      segments.push("HttpOnly");
    }

    if (options?.partitioned) {
      segments.push("Partitioned");
    }

    if (options?.secure) {
      segments.push("Secure");
    }

    if (typeof options?.sameSite === "string" && options.sameSite.length > 0) {
      segments.push(`SameSite=${options.sameSite}`);
    } else if (options?.sameSite === true) {
      segments.push("SameSite=Strict");
    }

    if (options?.priority) {
      segments.push(`Priority=${options.priority}`);
    }

    return this.append("Set-Cookie", segments.join("; "));
  }

  clearCookie(name: string, options?: CookieOptions): this {
    return this.cookie(name, "", {
      ...options,
      expires: new Date(0),
      maxAge: 0
    });
  }

  get(field: string): string | undefined {
    return (
      readHeader(this.#headers, field.toLowerCase()) ??
      this.#transport.getHeader(field)
    );
  }

  header(field: string, value: unknown): this {
    return this.set(field, value);
  }

  json(body?: unknown): this {
    this.type("application/json");
    return this.send(typeof body === "string" ? body : JSON.stringify(body ?? null));
  }

  jsonp(body?: unknown): this {
    const callbackName = typeof this.app?.get("jsonp callback name") === "string"
      ? String(this.app?.get("jsonp callback name"))
      : "callback";
    const payload = typeof body === "string" ? body : JSON.stringify(body ?? null);
    this.type("application/javascript");
    return this.send(`${callbackName}(${payload})`);
  }

  render(view: string, locals?: Record<string, unknown>, callback?: TemplateCallback): this {
    const engine = this.app?.resolveEngine(view);
    const viewLocals = locals ?? this.locals;

    if (!engine) {
      const html = `<rendered:${view}>`;
      if (callback) {
        callback(undefined, html);
        return this;
      }

      return this.send(html);
    }

    if (callback) {
      engine(view, viewLocals, callback);
      return this;
    }

    engine(view, viewLocals, (_error, html) => {
      this.send(html ?? "");
    });
    return this;
  }

  end(body?: unknown): this {
    return this.send(body);
  }

  send(body?: unknown): this {
    this.#transport.statusCode = this.#statusCode;

    const contentType = this.get("content-type");
    if (body == null) {
      void this.#transport.sendText("");
    } else if (body instanceof Uint8Array) {
      if (!contentType) {
        this.type("application/octet-stream");
      }
      void this.#transport.sendBytes(body);
    } else if (typeof body === "string") {
      void this.#transport.sendText(body);
    } else {
      if (!contentType) {
        this.type("application/json");
      }
      void this.#transport.sendText(JSON.stringify(body));
    }

    this.headersSent = true;
    return this;
  }

  set(field: string, value: unknown): this {
    const rendered = value == null ? "" : String(value);
    this.#headers[field.toLowerCase()] = rendered;
    this.#transport.setHeader(field, rendered);
    return this;
  }

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  type(typeName: string): this {
    return this.set("Content-Type", typeName);
  }

  vary(field: string): this {
    const current = this.get("vary");
    if (!current) {
      return this.set("Vary", field);
    }

    const entries = current.split(",");
    for (let index = 0; index < entries.length; index += 1) {
      if (entries[index]!.trim().toLowerCase() === field.toLowerCase()) {
        return this;
      }
    }

    return this.set("Vary", `${current}, ${field}`);
  }
}

function readHeader(
  headers: Record<string, string>,
  field: string
): string | undefined {
  for (const currentKey in headers) {
    if (currentKey === field) {
      return headers[currentKey];
    }
  }

  return undefined;
}
