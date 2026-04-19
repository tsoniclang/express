import type { JsValue } from "@tsonic/core/types.js";
import type { Request } from "./request.js";
import type { Response } from "./response.js";

// ---------------------------------------------------------------------------
// Delegate types
// ---------------------------------------------------------------------------

export type VerifyBodyHandler = (
  req: Request,
  res: Response,
  buffer: Uint8Array,
  encoding?: string
) => void;

export type CookieEncoder = (value: string) => string;

export type SetHeadersHandler = (
  res: Response,
  path: string,
  stat: FileStat
) => void;

// ---------------------------------------------------------------------------
// Router options
// ---------------------------------------------------------------------------

export interface RouterOptions {
  caseSensitive?: boolean;
  mergeParams?: boolean;
  strict?: boolean;
}

// ---------------------------------------------------------------------------
// Body-parser options
// ---------------------------------------------------------------------------

export interface JsonOptions {
  inflate?: boolean;
  limit?: string | number;
  reviver?: JsValue;
  strict?: boolean;
  type?: string | string[];
  verify?: VerifyBodyHandler;
}

export interface RawOptions {
  inflate?: boolean;
  limit?: string | number;
  type?: string | string[];
  verify?: VerifyBodyHandler;
}

export interface TextOptions {
  defaultCharset?: string;
  inflate?: boolean;
  limit?: string | number;
  type?: string | string[];
  verify?: VerifyBodyHandler;
}

export interface UrlEncodedOptions {
  extended?: boolean;
  inflate?: boolean;
  limit?: string | number;
  parameterLimit?: number;
  type?: string | string[];
  verify?: VerifyBodyHandler;
  depth?: number;
}

// ---------------------------------------------------------------------------
// Multipart options
// ---------------------------------------------------------------------------

export interface MultipartField {
  name: string;
  maxCount?: number;
}

export interface MultipartOptions {
  type?: string;
  maxFileCount?: number;
  maxFileSizeBytes?: number;
}

// ---------------------------------------------------------------------------
// CORS options
// ---------------------------------------------------------------------------

export interface CorsOptions {
  origins?: string[];
  credentials?: boolean;
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  maxAgeSeconds?: number;
  preflightContinue?: boolean;
  optionsSuccessStatus?: number;
}

// ---------------------------------------------------------------------------
// Static file serving options
// ---------------------------------------------------------------------------

export interface StaticOptions {
  dotfiles?: string;
  etag?: boolean;
  extensions?: string[] | false;
  fallthrough?: boolean;
  immutable?: boolean;
  index?: string | string[] | false;
  lastModified?: boolean;
  maxAge?: number | string;
  redirect?: boolean;
  setHeaders?: SetHeadersHandler;
  acceptRanges?: boolean;
  cacheControl?: boolean;
}

// ---------------------------------------------------------------------------
// File send / download options
// ---------------------------------------------------------------------------

export interface FileTransferOptions {
  maxAge?: number | string;
  root?: string;
  lastModified?: boolean;
  headers?: Record<string, string>;
  dotfiles?: string;
  acceptRanges?: boolean;
  cacheControl?: boolean;
  immutable?: boolean;
}

export interface SendFileOptions extends FileTransferOptions {}

export interface DownloadOptions extends FileTransferOptions {}

// ---------------------------------------------------------------------------
// Cookie options (re-exported from response.ts for broader use)
// ---------------------------------------------------------------------------

export interface CookieOptions {
  domain?: string;
  encode?: CookieEncoder;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  partitioned?: boolean;
  priority?: string;
  secure?: boolean;
  signed?: boolean;
  sameSite?: string | boolean;
}

// ---------------------------------------------------------------------------
// Range parsing
// ---------------------------------------------------------------------------

export interface RangeOptions {
  combine?: boolean;
}

export interface ByteRange {
  start: number;
  end: number;
}

export interface RangeResult {
  type: string;
  ranges: ByteRange[];
}

// ---------------------------------------------------------------------------
// File stat (used by static file serving)
// ---------------------------------------------------------------------------

export interface FileStat {
  size: number;
  modifiedAt: Date;
}
