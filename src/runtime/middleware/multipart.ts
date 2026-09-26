import type { MultipartField, MultipartOptions } from "../options.js";
import type { Request } from "../request.js";
import { readHeaderParameter } from "../header-parameters.js";
import { UploadedFile } from "../request-uploaded-file.js";
import type { NextFunction, RequestHandler } from "../types.js";
import { parseMultipartStream, type MultipartMode } from "./multipart-parser.js";

export class Multipart {
  readonly #type: string;
  readonly #maxFileCount: number | undefined;
  readonly #maxFileSizeBytes: number | undefined;

  constructor(options?: MultipartOptions) {
    this.#type = options?.type ?? "multipart/form-data";
    this.#maxFileCount = options?.maxFileCount;
    this.#maxFileSizeBytes = options?.maxFileSizeBytes;
    if (this.#maxFileCount !== undefined &&
        (!Number.isSafeInteger(this.#maxFileCount) || this.#maxFileCount < 0)) {
      throw new Error("Invalid multipart file count limit.");
    }
    if (this.#maxFileSizeBytes !== undefined &&
        (!Number.isSafeInteger(this.#maxFileSizeBytes) || this.#maxFileSizeBytes < 0)) {
      throw new Error("Invalid multipart file size limit.");
    }
  }

  any(): RequestHandler { return this.handler("any"); }
  none(): RequestHandler { return this.handler("none"); }
  single(name: string): RequestHandler {
    return this.handler("single", [{ name, maxCount: 1 }]);
  }
  array(name: string, maxCount?: number): RequestHandler {
    return this.handler("fields", [{ name, maxCount }]);
  }
  fields(fields: MultipartField[]): RequestHandler {
    return this.handler("fields", fields);
  }

  private handler(mode: MultipartMode, allowList?: readonly MultipartField[]): RequestHandler {
    return async (req, _res, next) => {
      await parse(req, mode, allowList, next, this.#type, this.#maxFileCount, this.#maxFileSizeBytes);
    };
  }
}

async function parse(
  req: Request,
  mode: MultipartMode,
  allowList: readonly MultipartField[] | undefined,
  next: NextFunction,
  expectedType: string,
  maxFileCount: number | undefined,
  maxFileSizeBytes: number | undefined
): Promise<void> {
  const contentType = req.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes(expectedType.toLowerCase())) {
    await next(undefined);
    return;
  }
  const boundary = readBoundary(contentType);
  if (boundary === undefined) throw new Error("Multipart boundary is required.");
  const parsed = await parseMultipartStream(req, boundary, {
    mode,
    allowList,
    maxFileCount,
    maxFileSizeBytes
  });

  req.body = parsed.body;
  req.file = undefined;
  req.files.clear();
  for (const file of parsed.files) {
    req.files.add(new UploadedFile(file));
  }
  if (mode === "single" && allowList !== undefined) {
    req.file = req.files.get(allowList[0]!.name)?.[0];
  }
  await next(undefined);
}

function readBoundary(contentType: string): string | undefined {
  return readHeaderParameter(contentType, "boundary");
}
