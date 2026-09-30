import type { Readable } from "node:stream";
import type { Application } from "./application.js";
import type { RangeOptions } from "./options.js";
import { Params } from "./params.js";
import { decodePercentEncoded } from "./percent-decoding.js";
import type { UploadedFile } from "./request-uploaded-file.js";
import { Cookies } from "./request-cookies.js";
import { Files } from "./request-files.js";
import type { Route } from "./route.js";
import type { Response } from "./response.js";
import type { RequestHeaders, TransportRequest } from "./types.js";

export class ParsedByteRange {
  start: number;
  end: number;

  constructor(start: number, end: number) {
    this.start = start;
    this.end = end;
  }
}

export class ParsedRangeResult {
  type: string;
  ranges: ParsedByteRange[];

  constructor(type: string, ranges: ParsedByteRange[]) {
    this.type = type;
    this.ranges = ranges;
  }
}

export class Request {
  readonly #transport: TransportRequest;
  readonly #headers: RequestHeaders = {};
  #bodyClaimed = false;

  app?: Application;
  baseUrl: string = "";
  body: unknown | undefined = undefined;
  readonly cookies: Cookies = new Cookies();
  file?: UploadedFile;
  readonly files: Files = new Files();
  fresh: boolean = false;
  method: string = "GET";
  originalUrl: string = "/";
  readonly params: Params = new Params();
  path: string = "/";
  query: Record<string, unknown> = {};
  res?: Response;
  route?: Route;
  signed: boolean = false;
  readonly signedCookies: Cookies = new Cookies();

  constructor(transport: TransportRequest, app?: Application) {
    this.#transport = transport;
    this.app = app;
    this.method = transport.method;
    this.path = transport.path;
    this.originalUrl = transport.path;
    this.query = transport.query ?? {};

    const rawCookies = this.get("cookie");
    if (rawCookies !== undefined && rawCookies.length > 0) {
      populateCookies(this.cookies, rawCookies);
    }
  }

  get transport(): TransportRequest {
    return this.#transport;
  }

  takeBody(): Readable {
    if (this.#bodyClaimed) {
      throw new Error("Request body already has a consumer.");
    }
    this.#bodyClaimed = true;
    return this.#transport.body;
  }

  get protocol(): string {
    const forwarded = this.get("x-forwarded-proto");
    if (forwarded !== undefined && forwarded.length > 0) {
      const first = forwarded.split(",")[0]!.trim().toLowerCase();
      if (first.length > 0) {
        return first;
      }
    }

    return "http";
  }

  get host(): string {
    return this.get("x-forwarded-host") ?? this.get("host") ?? "";
  }

  get hostname(): string {
    const host = this.host;
    if (host.length === 0) {
      return "";
    }

    return normalizeHostname(host);
  }

  get ip(): string {
    const forwardedFor = this.get("x-forwarded-for");
    if (forwardedFor === undefined || forwardedFor.length === 0) {
      return "";
    }

    const first = forwardedFor.split(",")[0]!.trim();
    return first;
  }

  get ips(): string[] {
    const forwardedFor = this.get("x-forwarded-for");
    if (forwardedFor === undefined || forwardedFor.length === 0) {
      return [];
    }

    const values = forwardedFor
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    return values;
  }

  get subdomains(): string[] {
    const hostname = this.hostname;
    if (hostname.length === 0) {
      return [];
    }

    const parts = hostname
      .split(".")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    const offsetValue = this.app?.get("subdomain offset");
    let offset: number = 2;
    if (typeof offsetValue === "number") {
      offset = Math.trunc(offsetValue);
    }
    if (parts.length <= offset) {
      return [];
    }

    const result: string[] = [];
    const subdomainCount = parts.length - offset;
    for (let index = 0; index < subdomainCount; index += 1) {
      result.push(parts[index]!);
    }
    result.reverse();
    return result;
  }

  get xhr(): boolean {
    const header = this.get("x-requested-with");
    return typeof header === "string" && header.toLowerCase() === "xmlhttprequest";
  }

  get secure(): boolean {
    return this.protocol === "https";
  }

  get stale(): boolean {
    return !this.fresh;
  }

  get(name: string): string | undefined {
    const key = name.toLowerCase();
    return readHeader(this.#headers, key) ?? this.#transport.headers[key]?.[0];
  }

  getAll(name: string): string[] {
    const key = name.toLowerCase();
    return [...(this.#headers[key] ?? this.#transport.headers[key] ?? [])];
  }

  header(name: string): string | undefined {
    return this.get(name);
  }

  param(name: string): string | undefined {
    return this.params.get(name);
  }

  setParam(name: string, value: unknown): void {
    this.params.set(name, value);
  }

  setHeader(name: string, value: string): void {
    this.#headers[name.toLowerCase()] = [value];
  }

  entries(): [string, string][] {
    return this.params.entries();
  }

  accepts(): string[];
  accepts(typeOrTypes: string | string[]): string | false;
  accepts(typeOrTypes?: string | string[]): string[] | string | false {
    return typeOrTypes === undefined ? this.accepts_none() : this.accepts_selected(typeOrTypes);
  }

  accepts_none(): string[] {
    const header = this.get("accept");
    return parseQualityHeader(header);
  }

  accepts_selected(typeOrTypes: string | string[]): string | false {
    const header = this.get("accept");
    const types = Array.isArray(typeOrTypes) ? typeOrTypes : [typeOrTypes];
    return selectAcceptedValue(header, types, normalizeMediaType);
  }

  acceptsCharsets(): string[];
  acceptsCharsets(charsetOrCharsets: string | string[]): string | false;
  acceptsCharsets(charsetOrCharsets?: string | string[]): string[] | string | false {
    return charsetOrCharsets === undefined
      ? this.acceptsCharsets_none()
      : this.acceptsCharsets_selected(charsetOrCharsets);
  }

  acceptsCharsets_none(): string[] {
    const header = this.get("accept-charset");
    return parseQualityHeader(header);
  }

  acceptsCharsets_selected(charsetOrCharsets: string | string[]): string | false {
    const header = this.get("accept-charset");
    const charsets = Array.isArray(charsetOrCharsets)
      ? charsetOrCharsets
      : [charsetOrCharsets];
    return selectAcceptedValue(header, charsets, (value) => value.toLowerCase());
  }

  acceptsEncodings(): string[];
  acceptsEncodings(encodingOrEncodings: string | string[]): string | false;
  acceptsEncodings(encodingOrEncodings?: string | string[]): string[] | string | false {
    return encodingOrEncodings === undefined
      ? this.acceptsEncodings_none()
      : this.acceptsEncodings_selected(encodingOrEncodings);
  }

  acceptsEncodings_none(): string[] {
    const header = this.get("accept-encoding");
    return parseQualityHeader(header);
  }

  acceptsEncodings_selected(
    encodingOrEncodings: string | string[]
  ): string | false {
    const header = this.get("accept-encoding");
    const encodings = Array.isArray(encodingOrEncodings)
      ? encodingOrEncodings
      : [encodingOrEncodings];
    return selectAcceptedValue(header, encodings, (value) => value.toLowerCase());
  }

  acceptsLanguages(): string[];
  acceptsLanguages(languageOrLanguages: string | string[]): string | false;
  acceptsLanguages(languageOrLanguages?: string | string[]): string[] | string | false {
    return languageOrLanguages === undefined
      ? this.acceptsLanguages_none()
      : this.acceptsLanguages_selected(languageOrLanguages);
  }

  acceptsLanguages_none(): string[] {
    const header = this.get("accept-language");
    return parseQualityHeader(header);
  }

  acceptsLanguages_selected(
    languageOrLanguages: string | string[]
  ): string | false {
    const header = this.get("accept-language");
    const languages = Array.isArray(languageOrLanguages)
      ? languageOrLanguages
      : [languageOrLanguages];
    return selectAcceptedLanguage(header, languages);
  }

  is(type: string): string | false;
  is(types: string[]): string | false;
  is(typeOrTypes: string | string[]): string | false {
    if (Array.isArray(typeOrTypes)) {
      return this.is_many(typeOrTypes);
    }

    return this.is_one(typeOrTypes);
  }

  is_one(type: string): string | false {
    return this.is_many([type]);
  }

  is_many(types: string[]): string | false {
    const contentType = readContentType(this.get("content-type"));
    if (contentType === undefined || contentType.length === 0) {
      return false;
    }

    for (let index = 0; index < types.length; index += 1) {
      const current = types[index]!;
      if (mediaTypeMatches(contentType, normalizeMediaType(current))) {
        return current;
      }
    }

    return false;
  }

  range(size: number, options?: RangeOptions): ParsedRangeResult | number {
    const header = this.get("range");
    if (header === undefined || header.length === 0) {
      return -2;
    }

    const equalsIndex = header.indexOf("=");
    if (equalsIndex <= 0) {
      return -2;
    }

    const unit = header.slice(0, equalsIndex).trim().toLowerCase();
    const spec = header.slice(equalsIndex + 1).trim();
    if (unit !== "bytes" || spec.length === 0) {
      return -2;
    }

    const ranges: ParsedByteRange[] = [];
    for (const entry of spec.split(",")) {
      const parsed = parseByteRange(entry.trim(), size);
      if (parsed !== null) ranges.push(parsed);
    }

    if (ranges.length === 0) {
      return -1;
    }

    return new ParsedRangeResult(
      unit,
      options !== undefined && options.combine === true
        ? combineRanges(ranges)
        : ranges
    );
  }
}

function readHeader(
  headers: RequestHeaders,
  name: string
): string | undefined {
  return headers[name]?.[0];
}

function populateCookies(store: Cookies, headerValue: string): void {
  for (const segment of headerValue.split(";")) {
    const trimmed = segment.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    if (key.length === 0) {
      continue;
    }

    const rawValue = trimmed.slice(separator + 1).trim();
    store.set(key, decodeCookieValue(rawValue));
  }
}

function decodeCookieValue(value: string): string {
  try {
    return decodePercentEncoded(value);
  } catch {
    return value;
  }
}

function normalizeHostname(value: string): string {
  const first = value.split(",")[0]!.trim();
  if (first.startsWith("[")) {
    const end = first.indexOf("]");
    return end >= 0 ? first.slice(1, end) : first;
  }

  const colonIndex = first.indexOf(":");
  return colonIndex >= 0 ? first.slice(0, colonIndex) : first;
}

function parseQualityHeader(header: string | undefined): string[] {
  if (header === undefined || header.trim().length === 0) {
    return ["*"];
  }

  const weighted: Array<{ value: string; quality: number }> = [];
  for (const entry of header.split(",")) {
    const parsed = parseWeightedValue(entry);
    if (parsed !== null) weighted.push(parsed);
  }
  weighted.sort((left, right) => right.quality - left.quality);
  return weighted.map((entry) => entry.value);
}

function parseWeightedValue(
  entry: string
): { value: string; quality: number } | null {
  const parts = entry
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return null;
  }

  const value = parts[0]!.toLowerCase();
  let quality: number = 1;
  for (let index = 1; index < parts.length; index += 1) {
    const current = parts[index]!;
    if (!current.startsWith("q=")) {
      continue;
    }

    const parsed = Number(current.slice(2));
    if (Number.isFinite(parsed)) {
      quality = parsed;
    }
  }

  return { value, quality };
}

function selectAcceptedValue(
  header: string | undefined,
  candidates: string[],
  normalizeCandidate: (value: string) => string
): string | false {
  if (candidates.length === 0) {
    return false;
  }

  const accepted = parseQualityHeader(header);
  for (let acceptedIndex = 0; acceptedIndex < accepted.length; acceptedIndex += 1) {
    const acceptedValue = accepted[acceptedIndex]!;
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const candidate = candidates[candidateIndex]!;
      if (
        tokenMatchesAcceptedValue(
          normalizeCandidate(candidate),
          acceptedValue
        )
      ) {
        return candidate;
      }
    }
  }

  return false;
}

function selectAcceptedLanguage(
  header: string | undefined,
  candidates: string[]
): string | false {
  if (candidates.length === 0) {
    return false;
  }

  const accepted = parseQualityHeader(header);
  for (let acceptedIndex = 0; acceptedIndex < accepted.length; acceptedIndex += 1) {
    const acceptedValue = accepted[acceptedIndex]!;
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const candidate = candidates[candidateIndex]!;
      const normalized = candidate.toLowerCase();
      if (
        acceptedValue === "*" ||
        normalized === acceptedValue ||
        normalized.startsWith(`${acceptedValue}-`) ||
        acceptedValue.startsWith(`${normalized}-`)
      ) {
        return candidate;
      }
    }
  }

  return false;
}

function tokenMatchesAcceptedValue(candidate: string, accepted: string): boolean {
  if (accepted === "*" || accepted === "*/*") {
    return true;
  }

  if (candidate === accepted) {
    return true;
  }

  if (candidate.includes("/")) {
    return mediaTypeMatches(candidate, accepted);
  }

  return candidate === accepted;
}

function normalizeMediaType(value: string): string {
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "html":
      return "text/html";
    case "json":
      return "application/json";
    case "text":
      return "text/plain";
    case "xml":
      return "application/xml";
    case "urlencoded":
      return "application/x-www-form-urlencoded";
    default:
      return normalized;
  }
}

function readContentType(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0) {
    return undefined;
  }

  return value.split(";")[0]!.trim().toLowerCase();
}

function mediaTypeMatches(candidate: string, accepted: string): boolean {
  if (accepted === "*/*") {
    return true;
  }

  const [candidateType, candidateSubtype] = candidate.split("/");
  const [acceptedType, acceptedSubtype] = accepted.split("/");
  if (candidateType === undefined || candidateType.length === 0 ||
      candidateSubtype === undefined || candidateSubtype.length === 0 ||
      acceptedType === undefined || acceptedType.length === 0 ||
      acceptedSubtype === undefined || acceptedSubtype.length === 0) {
    return candidate === accepted;
  }

  return (
    (acceptedType === "*" || acceptedType === candidateType) &&
    (acceptedSubtype === "*" || acceptedSubtype === candidateSubtype)
  );
}

function parseByteRange(
  entry: string,
  size: number
): ParsedByteRange | null {
  const dashIndex = entry.indexOf("-");
  if (dashIndex < 0) {
    return null;
  }

  const startText = entry.slice(0, dashIndex).trim();
  const endText = entry.slice(dashIndex + 1).trim();

  if (startText.length === 0) {
    const suffixLength = Number(endText);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      return null;
    }

    const end = size - 1;
    const start = Math.max(0, size - suffixLength);
    return start <= end ? new ParsedByteRange(start, end) : null;
  }

  const start = Number(startText);
  if (!Number.isInteger(start) || start < 0 || start >= size) {
    return null;
  }

  let end = size - 1;
  if (endText.length > 0) {
    end = Number(endText);
    if (!Number.isInteger(end) || end < start) {
      return null;
    }
  }

  if (end >= size) {
    end = size - 1;
  }

  return new ParsedByteRange(start, end);
}

function combineRanges(
  ranges: readonly ParsedByteRange[]
): ParsedByteRange[] {
  if (ranges.length <= 1) {
    return [...ranges];
  }

  const ordered = [...ranges].sort((left, right) => left.start - right.start);
  const combined: ParsedByteRange[] = [ordered[0]!];
  for (let index = 1; index < ordered.length; index += 1) {
    const current = ordered[index]!;
    const last = combined[combined.length - 1]!;
    if (current.start <= last.end + 1) {
      last.end = Math.max(last.end, current.end);
      continue;
    }

    combined.push(new ParsedByteRange(current.start, current.end));
  }

  return combined;
}
