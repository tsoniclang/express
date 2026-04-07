import { overloads as O } from "@tsonic/core/lang.js";
import type { UploadedFile } from "./request-uploaded-file.js";

/**
 * Case-insensitive store of uploaded files, keyed by form field name.
 *
 * Each field may contain multiple files (e.g. `<input type="file" multiple>`).
 */
export class Files {
  readonly #files: Record<string, UploadedFile[] | undefined> = {};

  get(field: string): UploadedFile[] | undefined {
    const list = readEntry(this.#files, field.toLowerCase());
    if (list === undefined) {
      return undefined;
    }

    return [...list];
  }

  /** @internal */
  add(file: UploadedFile): void;
  /** @internal */
  add(field: string, file: UploadedFile): void;
  add(fieldOrFile: string | UploadedFile, maybeFile?: UploadedFile): void {
    if (typeof fieldOrFile === "string") {
      if (maybeFile === undefined) {
        throw new Error("Expected UploadedFile when adding by field name.");
      }

      this.add_field(fieldOrFile, maybeFile);
      return;
    }

    this.add_file(fieldOrFile);
  }

  add_file(file: UploadedFile): void {
    this.addToField(file.fieldname, file);
  }

  add_field(field: string, file: UploadedFile): void {
    this.addToField(field, file);
  }

  /** @internal */
  clear(): void {
    for (const k in this.#files) {
      delete this.#files[k];
    }
  }

  entries(): [string, UploadedFile[]][] {
    const result: [string, UploadedFile[]][] = [];
    for (const k in this.#files) {
      const list = readEntry(this.#files, k);
      if (list !== undefined) {
        result.push([k, [...list]]);
      }
    }
    return result;
  }

  private addToField(field: string, file: UploadedFile): void {
    const normalised = field.toLowerCase();
    const existing = readEntry(this.#files, normalised);
    if (existing !== undefined) {
      existing.push(file);
    } else {
      this.#files[normalised] = [file];
    }
  }
}

function readEntry(
  files: Record<string, UploadedFile[] | undefined>,
  key: string
): UploadedFile[] | undefined {
  for (const currentKey in files) {
    if (currentKey === key) {
      return files[currentKey];
    }
  }

  return undefined;
}

O<Files>().method(x => x.add_file).family(x => x.add);
O<Files>().method(x => x.add_field).family(x => x.add);
