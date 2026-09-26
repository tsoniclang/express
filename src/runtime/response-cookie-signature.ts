import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Sign a cookie value with an HMAC-SHA256 signature.
 *
 * Returns `"s:<value>.<base64url-signature>"`.
 */
export function sign(value: string, secret: string): string {
  const sig = signature(value, secret);
  return `s:${value}.${sig}`;
}

/**
 * Verify and extract the original value from a signed cookie string.
 *
 * Returns the original value if the signature is valid, or `undefined`
 * if the input is malformed or the signature does not match.
 */
export function unsign(
  signedValue: string,
  secret: string
): string | undefined {
  if (!signedValue.startsWith("s:")) {
    return undefined;
  }

  const raw = signedValue.slice(2);
  const dot = raw.lastIndexOf(".");
  if (dot <= 0 || dot === raw.length - 1) {
    return undefined;
  }

  const value = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = signature(value, secret);

  if (!fixedTimeEquals(sig, expected)) {
    return undefined;
  }

  return value;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function signature(value: string, secret: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(value);
  return trimBase64Padding(hmac.digest("base64"));
}

function fixedTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function trimBase64Padding(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "=") {
    end -= 1;
  }

  return value.slice(0, end);
}
