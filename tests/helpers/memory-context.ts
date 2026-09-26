import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import type { TransportContext, TransportRequest, TransportResponse } from "../../src/index.js";

export interface ContextOverrides extends Omit<Partial<TransportRequest>, "headers" | "body"> {
  headers?: Record<string, string | string[]>;
  bodyText?: string;
  bodyBytes?: Uint8Array;
  body?: Readable;
}

export class MemoryResponse implements TransportResponse {
  statusCode = 200;
  headersSent = false;
  readonly headers = new Map<string, string>();
  bodyText = "";
  bodyBytes: Buffer | undefined;

  appendHeader(name: string, value: string): void {
    const key = name.toLowerCase();
    const current = this.headers.get(key);
    this.headers.set(key, current ? `${current}, ${value}` : value);
  }

  getHeader(name: string): string | undefined {
    return this.headers.get(name.toLowerCase());
  }

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  removeHeader(name: string): void {
    this.headers.delete(name.toLowerCase());
  }

  sendBytes(bytes: Buffer): void {
    this.bodyBytes = bytes;
    this.headersSent = true;
  }

  sendText(text: string): void {
    this.bodyText = text;
    this.headersSent = true;
  }

  async pipeFrom(source: Readable): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of source) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    this.sendBytes(Buffer.concat(chunks));
  }
}

export function createContext(
  method: string,
  path: string,
  overrides?: ContextOverrides
): TransportContext & { response: MemoryResponse } {
  const response = new MemoryResponse();
  const normalizedHeaders: Record<string, string[]> = {};
  for (const [name, value] of Object.entries(overrides?.headers ?? {})) {
    normalizedHeaders[name.toLowerCase()] = typeof value === "string" ? [value] : value;
  }
  const body = overrides?.body ?? Readable.from([
    overrides?.bodyBytes === undefined
      ? Buffer.from(overrides?.bodyText ?? "")
      : Buffer.from(overrides.bodyBytes)
  ]);
  return {
    request: {
      method,
      path,
      headers: normalizedHeaders,
      body,
      cleanup: [],
      query: overrides?.query
    },
    response
  };
}
