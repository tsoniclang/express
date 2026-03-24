import type { TransportContext, TransportRequest, TransportResponse } from "../../src/index.js";

export class MemoryResponse implements TransportResponse {
  statusCode = 200;
  headersSent = false;
  readonly headers = new Map<string, string>();
  bodyText = "";
  bodyBytes: Uint8Array | undefined;

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

  sendBytes(bytes: Uint8Array): void {
    this.bodyBytes = bytes;
    this.headersSent = true;
  }

  sendText(text: string): void {
    this.bodyText = text;
    this.headersSent = true;
  }
}

export function createContext(
  method: string,
  path: string,
  overrides?: Partial<TransportRequest>
): TransportContext & { response: MemoryResponse } {
  const response = new MemoryResponse();
  return {
    request: {
      method,
      path,
      headers: {},
      ...overrides
    },
    response
  };
}
