
export class Params {
  readonly #entries: Record<string, string | undefined> = {};

  get(name: string): string | undefined {
    return readEntry(this.#entries, name.toLowerCase());
  }

  set(name: string, value: unknown | undefined): void {
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
      this.#entries[key] = undefined;
    }
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
