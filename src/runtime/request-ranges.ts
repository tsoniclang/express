import type { createReadStream } from "node:fs";

type ReadOptions = Extract<NonNullable<Parameters<typeof createReadStream>[1]>, object>;
export type FileOffset = NonNullable<ReadOptions["start"]>;

export interface RangeOptions {
  combine?: boolean;
}

export class ParsedByteRange {
  start: FileOffset;
  end: FileOffset;

  constructor(start: FileOffset, end: FileOffset) {
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

export function parseRangeHeader(
  header: string | undefined,
  size: FileOffset,
  options?: RangeOptions
): ParsedRangeResult | number {
  if (header === undefined || header.length === 0) return -2;
  const equalsIndex = header.indexOf("=");
  if (equalsIndex <= 0) return -2;
  const unit = header.slice(0, equalsIndex).trim().toLowerCase();
  const spec = header.slice(equalsIndex + 1).trim();
  if (unit !== "bytes" || spec.length === 0) return -2;
  const ranges: ParsedByteRange[] = [];
  for (const entry of spec.split(",")) {
    const parsed = parseByteRange(entry.trim(), size);
    if (parsed !== null) ranges.push(parsed);
  }
  if (ranges.length === 0) return -1;
  return new ParsedRangeResult(
    unit,
    options !== undefined && options.combine === true ? combineRanges(ranges) : ranges
  );
}

function parseByteRange(entry: string, size: FileOffset): ParsedByteRange | null {
  if (size <= 0) return null;
  const dashIndex = entry.indexOf("-");
  if (dashIndex < 0) return null;
  const startText = entry.slice(0, dashIndex).trim();
  const endText = entry.slice(dashIndex + 1).trim();
  if (startText.length === 0) {
    const suffixLength = parseBoundedDecimal(endText, size);
    if (suffixLength === null || suffixLength === 0) return null;
    return new ParsedByteRange(size - suffixLength, size - 1);
  }
  const start = parseBoundedDecimal(startText, size);
  if (start === null || start >= size) return null;
  let end = size - 1;
  if (endText.length > 0) {
    const parsedEnd = parseBoundedDecimal(endText, size);
    if (parsedEnd === null || parsedEnd < start) return null;
    end = parsedEnd >= size ? size - 1 : parsedEnd;
  }
  return new ParsedByteRange(start, end);
}

function parseBoundedDecimal(text: string, limit: FileOffset): FileOffset | null {
  if (text.length === 0) return null;
  const remainder = limit % 10;
  const cutoff = (limit - remainder) / 10;
  let value: FileOffset = 0;
  let saturated = false;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.codePointAt(index);
    if (code === undefined || code < 48 || code > 57) return null;
    if (saturated) continue;
    const digit = code - 48;
    if (value > cutoff || value === cutoff && digit > remainder) {
      value = limit;
      saturated = true;
    } else {
      value = value * 10 + digit;
    }
  }
  return value;
}

function combineRanges(ranges: readonly ParsedByteRange[]): ParsedByteRange[] {
  if (ranges.length <= 1) return [...ranges];
  const ordered = [...ranges].sort((left, right) =>
    left.start < right.start ? -1 : left.start > right.start ? 1 : 0);
  const combined: ParsedByteRange[] = [ordered[0]!];
  for (let index = 1; index < ordered.length; index += 1) {
    const current = ordered[index]!;
    const last = combined[combined.length - 1]!;
    if (current.start <= last.end + 1) {
      if (current.end > last.end) last.end = current.end;
    } else {
      combined.push(new ParsedByteRange(current.start, current.end));
    }
  }
  return combined;
}
