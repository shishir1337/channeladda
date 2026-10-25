import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import {
  base58CheckDecode,
  base58Decode,
  keccak256,
  sha256,
  toHex,
} from "@/lib/address-hash";

const text = (s: string) => new TextEncoder().encode(s);

test("SHA-256 matches Node's, across the block boundaries", () => {
  for (const length of [0, 1, 3, 55, 56, 63, 64, 65, 119, 120, 200]) {
    const data = new Uint8Array(length).map((_, i) => (i * 37 + 11) & 0xff);
    expect(toHex(sha256(data)), `length ${length}`).toBe(
      createHash("sha256").update(data).digest("hex"),
    );
  }
});

test("Keccak-256 gives the published digests (Ethereum's, not SHA-3's)", () => {
  expect(toHex(keccak256(text("")))).toBe(
    "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
  );
  expect(toHex(keccak256(text("abc")))).toBe(
    "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
  );
  // Longer than one 136-byte block.
  expect(toHex(keccak256(new Uint8Array(200)))).toHaveLength(64);
});

test("base58 keeps leading zeros and refuses letters it has no place for", () => {
  expect(toHex(base58Decode("1112") ?? new Uint8Array())).toBe("00000001");
  expect(base58Decode("0OIl")).toBeNull();
});

test("a base58check string with one character changed fails its checksum", () => {
  // The Bitcoin genesis address.
  const good = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
  expect(base58CheckDecode(good)?.[0]).toBe(0);
  expect(base58CheckDecode("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb")).toBeNull();
});
