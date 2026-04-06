import type { JsValue } from "@tsonic/core/types.js";

export class Params {
  readonly #entries: Record<string, string | undefined> = {};

  get(name: string): string | undefined {
    return readEntry(this.#entries, name.toLowerCase());
  }

  set(name: string, value: JsValue | undefined): void {
    this.#entries[name.toLowerCase()] = value == null ? "" : String(value);
  }

  entries(): [string, string][] {
    const result: [string, string][] = [];
    for (const key in this.#entries) {
      const value = readEntry(this.#entries, key);
      if (value !== undefined) {
        result.push([key, value]);
      }
    }
    return result;
  }

  clear(): void {
    for (const key in this.#entries) {
      delete this.#entries[key];
    }
  }

  get [Symbol.toStringTag](): string {
    return "Params";
  }
}

function readEntry(
  entries: Record<string, string | undefined>,
  name: string
): string | undefined {
  for (const currentKey in entries) {
    if (currentKey === name) {
      return entries[currentKey];
    }
  }

  return undefined;
}
