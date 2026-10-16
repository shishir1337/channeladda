import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import {
  canonicalJson,
  signatureBase,
  signPayload,
  verifyWebhookSign,
} from "@/lib/cryptomus-sign";

/** The formula from Cryptomus's docs, written out independently of the code. */
const expected = (json: string, key: string) =>
  createHash("md5")
    .update(Buffer.from(json, "utf8").toString("base64") + key)
    .digest("hex");

test("canonical json escapes forward slashes the way PHP does", () => {
  // This is the whole reason this module exists. Cryptomus signs the output of
  // PHP's json_encode, which turns / into \/; JSON.stringify does not. Any
  // payload with a URL in it — which is every invoice we create — fails
  // signature verification if this is missed.
  expect(canonicalJson({ url: "https://channeladda.com/pay" })).toBe(
    '{"url":"https:\\/\\/channeladda.com\\/pay"}',
  );
});

test("canonical json leaves unicode unescaped", () => {
  // Cryptomus uses JSON_UNESCAPED_UNICODE, so the bytes are the characters.
  expect(canonicalJson({ name: "Канал" })).toBe('{"name":"Канал"}');
});

test("canonical json keeps key order and omits undefined", () => {
  expect(canonicalJson({ b: 1, a: 2, c: undefined })).toBe('{"b":1,"a":2}');
});

test("the signature base is base64 of the canonical json", () => {
  const body = { amount: "15", currency: "USD", order_id: "CA-10001" };
  expect(signatureBase(body)).toBe(
    Buffer.from(canonicalJson(body), "utf8").toString("base64"),
  );
});

test("the signature is md5 of the base64 body joined to the key", () => {
  const body = { amount: "10.28", currency: "USD", order_id: "CA-42" };
  expect(signPayload(body, "test-api-key")).toBe(
    expected(canonicalJson(body), "test-api-key"),
  );
});

test("md5 is produced as lowercase hex", () => {
  expect(signPayload({ a: 1 }, "k")).toMatch(/^[0-9a-f]{32}$/);
});

test("a webhook signed with our own formula verifies", () => {
  const payload = {
    type: "payment",
    uuid: "26109ba0-b05b-4ee0-93d1-fd62c822ce95",
    order_id: "CA-10001",
    status: "paid",
    is_final: true,
  };
  const sign = signPayload(payload, "payment-key");
  expect(verifyWebhookSign({ ...payload, sign }, "payment-key")).toBe(true);
});

test("a webhook carrying a url still verifies", () => {
  // The regression the slash escaping exists for: txid and callback URLs
  // routinely contain slashes.
  const payload = {
    order_id: "CA-10001",
    status: "paid",
    aml_verification_url: "https://cryptomus.com/aml/abc",
  };
  const sign = signPayload(payload, "payment-key");
  expect(verifyWebhookSign({ ...payload, sign }, "payment-key")).toBe(true);
});

test("a tampered amount fails verification", () => {
  const payload = { order_id: "CA-1", status: "paid", payment_amount: "10" };
  const sign = signPayload(payload, "payment-key");
  expect(
    verifyWebhookSign(
      { ...payload, payment_amount: "1000", sign },
      "payment-key",
    ),
  ).toBe(false);
});

test("the wrong key fails verification", () => {
  const payload = { order_id: "CA-1", status: "paid" };
  const sign = signPayload(payload, "payment-key");
  expect(verifyWebhookSign({ ...payload, sign }, "other-key")).toBe(false);
});

test("a missing or malformed sign fails rather than throwing", () => {
  expect(verifyWebhookSign({ order_id: "CA-1" }, "k")).toBe(false);
  expect(verifyWebhookSign({ order_id: "CA-1", sign: "" }, "k")).toBe(false);
  expect(verifyWebhookSign({ order_id: "CA-1", sign: 42 }, "k")).toBe(false);
  expect(verifyWebhookSign({ order_id: "CA-1", sign: "short" }, "k")).toBe(
    false,
  );
});

test("the sign field is excluded from the hash, not merely ignored", () => {
  // If `sign` were left in the payload the hash could never match, because
  // Cryptomus computes it over the payload without it.
  const payload = { order_id: "CA-1", status: "paid" };
  const sign = signPayload(payload, "k");
  expect(signPayload({ ...payload, sign }, "k")).not.toBe(sign);
  expect(verifyWebhookSign({ ...payload, sign }, "k")).toBe(true);
});

test("an empty key is refused rather than signing with nothing", () => {
  // Signing with "" produces a stable, guessable hash of the body alone.
  expect(() => signPayload({ a: 1 }, "")).toThrow(/key/i);
  expect(verifyWebhookSign({ order_id: "x", sign: "a".repeat(32) }, "")).toBe(
    false,
  );
});
