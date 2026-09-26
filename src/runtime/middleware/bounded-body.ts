import { Buffer } from "node:buffer";
import type { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type { Request } from "../request.js";

export async function readBoundedBody(req: Request, maxBytes: number, inflate: boolean = true): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new Error("Invalid body size limit");
  }

  const encoding = (req.get("content-encoding") ?? "identity").trim().toLowerCase();
  if (encoding === "identity") return await collectBounded(req.takeBody(), maxBytes);
  if (!inflate) throw new Error("Compressed request body is not permitted");
  const decoder = encoding === "gzip" ? createGunzip()
    : encoding === "deflate" ? createInflate()
      : encoding === "br" ? createBrotliDecompress() : undefined;
  if (decoder === undefined) throw new Error("Unsupported request content encoding");
  const source = req.takeBody();
  const onSourceError = (error: Error): void => { decoder.destroy(error); };
  source.once("error", onSourceError);
  try {
    return await collectBounded(source.pipe(decoder), maxBytes);
  } finally {
    source.off("error", onSourceError);
    source.destroy();
    decoder.destroy();
  }
}

export async function collectBounded(source: Readable, maxBytes: number): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const detach = (): void => {
      source.off("data", onData);
      source.off("end", onEnd);
      source.off("error", onError);
      source.off("close", onClose);
    };
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      detach();
      source.destroy();
      reject(error);
    };
    const onData = (chunk: Buffer): void => {
      if (chunk.length > maxBytes - total) {
        fail(new Error("request entity too large"));
        return;
      }
      total += chunk.length;
      chunks.push(chunk);
    };
    const onEnd = (): void => {
      if (settled) return;
      settled = true;
      detach();
      resolve(Buffer.concat(chunks, total));
    };
    const onError = (error: Error): void => fail(error);
    const onClose = (): void => fail(new Error("request body closed before completion"));

    source.on("data", onData);
    source.once("end", onEnd);
    source.once("error", onError);
    source.once("close", onClose);
  });
}
