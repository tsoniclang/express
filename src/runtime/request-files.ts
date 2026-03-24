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
      this.addToField(fieldOrFile, maybeFile!);
      return;
    }

    this.addToField(fieldOrFile.fieldname, fieldOrFile);
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
