import type { JsValue } from "@tsonic/core/types.js";

/**
 * Thin JS interop helpers that mirror the CLR `js_interop` static class.
 *
 * In native TypeScript most of these are trivial (Date is already a Date,
 * Error is already an Error), but the helpers exist to keep the porting
 * surface consistent and to centralise any future platform quirks.
 */

/**
 * Convert a `Date` (or timestamp number) to a `Date`.
 *
 * In the CLR build this converts `DateTime` -> JS `Date` via epoch millis.
 * In native TS a `Date` is already a `Date`, so this is effectively an
 * identity — but it normalises non-Date inputs (e.g. numeric timestamps).
 */
export function fromDate(value: Date | number): Date {
  if (value instanceof Date) {
    return value;
  }

  return new Date(value);
}

/**
 * Overload accepting `undefined | null`, returning `undefined`.
 */
export function fromDateOrUndefined(
  value: Date | number | undefined | null
): Date | undefined {
  if (value == null) {
    return undefined;
  }

  return fromDate(value);
}

/**
 * Wrap an arbitrary thrown value as an `Error`.
 *
 * In the CLR build this wraps `System.Exception` into a JS `Error`.
 * In native TS the value might already be an `Error`; if not we wrap
 * its string representation.
 */
export function fromException(value: JsValue): Error | undefined {
  if (value == null) {
    return undefined;
  }

  if (value instanceof Error) {
    return value;
  }

  return new Error(String(value));
}
