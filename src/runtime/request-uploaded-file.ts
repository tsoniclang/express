import { Buffer } from "node:buffer";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Readable } from "node:stream";

/**
 * Represents a single file received via a multipart upload.
 *
 * The transport layer (e.g. busboy, formidable, the Node http adapter)
 * provides the underlying stream / buffer behind `TransportFile`.
 */
export interface TransportFile {
  /** Form field name this file was submitted under. */
  readonly fieldname: string;
  /** Original filename on the client machine. */
  readonly originalname: string;
  /** MIME type reported by the client. */
  readonly mimetype: string;
  /** Size in bytes (may be 0 until the stream has been fully consumed). */
  readonly size: number;
  /** Return a readable stream for the file contents. */
  stream(): Readable;
  /** Return the full file contents as bytes. */
  buffer(): Promise<Buffer>;
  save(path: string): Promise<void>;
}

export class UploadedFile {
  readonly #transport: TransportFile;

  readonly fieldname: string;
  readonly originalname: string;
  readonly mimetype: string;
  readonly size: number;

  /** @internal */
  constructor(transport: TransportFile) {
    this.#transport = transport;
    this.fieldname = transport.fieldname;
    this.originalname = transport.originalname;
    this.mimetype = transport.mimetype;
    this.size = transport.size;
  }

  /** Return the file contents as a `Uint8Array`. */
  async bytes(): Promise<Buffer> {
    return await this.#transport.buffer();
  }

  /** Return the file contents decoded as UTF-8 text. */
  async text(): Promise<string> {
    const bytes = await this.#transport.buffer();
    return bytes.toString("utf-8");
  }

  async save(path: string): Promise<void> {
    await this.#transport.save(path);
  }

  /** @internal – expose the underlying readable for piping. */
  stream(): Readable {
    return this.#transport.stream();
  }
}

export class DiskTransportFile implements TransportFile {
  readonly fieldname: string;
  readonly originalname: string;
  readonly mimetype: string;
  readonly size: number;
  readonly #path: string;

  constructor(path: string, fieldname: string, originalname: string, mimetype: string, size: number) {
    this.#path = path;
    this.fieldname = fieldname;
    this.originalname = originalname;
    this.mimetype = mimetype;
    this.size = size;
  }

  stream(): Readable {
    return createReadStream(this.#path);
  }

  async buffer(): Promise<Buffer> {
    return await readFile(this.#path);
  }

  async save(path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await copyFile(this.#path, path);
  }
}
