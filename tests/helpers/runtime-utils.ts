import type { Application } from "../../src/index.js";
import { createContext, MemoryResponse } from "./memory-context.js";
import type { TransportContext, TransportRequest } from "../../src/index.js";

export type TestContext = TransportContext & { response: MemoryResponse };

export function createTestContext(
  method: string,
  path: string,
  options?: {
    body?: string;
    contentType?: string;
    queryString?: string;
    host?: string;
    headers?: Record<string, string>;
  }
): TestContext {
  const headers: Record<string, string> = { ...(options?.headers ?? {}) };

  if (options?.contentType) {
    headers["content-type"] = options.contentType;
  }

  if (options?.host) {
    headers["host"] = options.host;
  }

  const overrides: Partial<TransportRequest> = { headers };

  if (options?.body !== undefined) {
    overrides.bodyText = options.body;
  }

  if (options?.queryString) {
    overrides.query = parseQueryString(options.queryString);
  }

  return createContext(method, path, overrides);
}

export async function run(app: Application, context: TestContext): Promise<void> {
  await app.handle(context, app);
}

export function readBody(context: TestContext): string {
  return context.response.bodyText;
}

function parseQueryString(qs: string): Record<string, unknown> {
  const clean = qs.startsWith("?") ? qs.slice(1) : qs;
  const result: Record<string, unknown> = {};

  for (const pair of clean.split("&")) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex < 0) {
      continue;
    }

    const key = decodeURIComponent(pair.slice(0, eqIndex));
    const value = decodeURIComponent(pair.slice(eqIndex + 1));
    const existing = result[key];

    if (existing === undefined) {
      result[key] = value;
    } else if (Array.isArray(existing)) {
      result[key] = [...existing, value];
    } else {
      result[key] = [existing as string, value];
    }
  }

  return result;
}
