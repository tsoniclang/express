/**
 * Case-insensitive cookie store backed by a plain record.
 *
 * Keys are normalised to lowercase on every operation so that
 * lookups like `cookies.get("Session")` and `cookies.get("session")`
 * resolve to the same entry.
 */
export class Cookies {
  readonly #values: Record<string, string | undefined> = {};

  get(key: string): string | undefined {
    return readEntry(this.#values, key.toLowerCase());
  }

  /** @internal */
  set(key: string, value: string): void {
    this.#values[key.toLowerCase()] = value;
  }

  /** @internal */
  remove(key: string): boolean {
    const normalised = key.toLowerCase();
    if (readEntry(this.#values, normalised) === undefined) {
      return false;
    }

    delete this.#values[normalised];
    return true;
  }

  /** @internal */
  clear(): void {
    for (const k in this.#values) {
      delete this.#values[k];
    }
  }

  entries(): [string, string][] {
    const result: [string, string][] = [];
    for (const k in this.#values) {
      const v = readEntry(this.#values, k);
      if (v !== undefined) {
        result.push([k, v]);
      }
    }
    return result;
  }
}

function readEntry(
  values: Record<string, string | undefined>,
  key: string
): string | undefined {
  for (const currentKey in values) {
    if (currentKey === key) {
      return values[currentKey];
    }
  }

  return undefined;
}
