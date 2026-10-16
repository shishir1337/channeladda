import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Cryptomus request and webhook signatures.
 *
 * The scheme is `md5(base64(json_body) + api_key)`, sent as the `sign` header
 * on requests and as a `sign` field on webhooks. Two details decide whether it
 * works, and both are easy to get wrong:
 *
 * 1. **Forward slashes.** Cryptomus hashes the output of PHP's `json_encode`,
 *    which escapes `/` as `\/`. `JSON.stringify` does not. Every invoice we
 *    create carries callback URLs, so a signature computed without this is
 *    wrong on every single request — and the failure arrives as a flat
 *    "You are forbidden", which says nothing about why.
 * 2. **The `sign` field itself** is removed from a webhook payload before
 *    hashing, because Cryptomus computed it over the payload without it.
 *
 * Kept pure and separate from the HTTP client so the part that is fiddly is
 * also the part that is exhaustively testable without a network or a key.
 */

/** PHP's `json_encode(..., JSON_UNESCAPED_UNICODE)`, as closely as matters. */
export function canonicalJson(body: unknown): string {
  // JSON.stringify never emits an escaped slash of its own, so replacing every
  // slash is safe: there is no `\/` already in the string to double-escape.
  return JSON.stringify(body).replace(/\//g, "\\/");
}

export function signatureBase(body: unknown): string {
  return Buffer.from(canonicalJson(body), "utf8").toString("base64");
}

export function signPayload(body: unknown, apiKey: string): string {
  if (!apiKey) {
    // Signing with an empty key yields a hash of the body alone, which anyone
    // can reproduce. Better to fail loudly than to send something that looks
    // signed and is not.
    throw new Error("Cryptomus API key is missing; refusing to sign.");
  }
  return createHash("md5")
    .update(signatureBase(body) + apiKey)
    .digest("hex");
}

/** Constant-time compare of two hex digests of the same length. */
function hexEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/**
 * Whether a webhook body really came from Cryptomus.
 *
 * Returns false rather than throwing on anything malformed: this runs on an
 * unauthenticated public route, so a bad payload is an ordinary event and not
 * an exceptional one.
 */
export function verifyWebhookSign(
  payload: Record<string, unknown>,
  apiKey: string,
): boolean {
  if (!apiKey) return false;

  const { sign, ...rest } = payload;
  if (typeof sign !== "string" || !/^[0-9a-f]{32}$/i.test(sign)) return false;

  return hexEquals(signPayload(rest, apiKey).toLowerCase(), sign.toLowerCase());
}
