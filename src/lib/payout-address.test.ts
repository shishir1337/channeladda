import { expect, test } from "vitest";
import {
  ADDRESS_TYPO,
  checkPayoutAddress,
  checkTxHash,
  PAYOUT_NETWORKS,
} from "@/lib/payout-address";

/**
 * A payout sent to a mistyped address is gone, and the only check used to be
 * a length of 20 to 120 characters — any typo of the right length passed.
 * These are format checks: they catch a wrong network, a missing character
 * or a pasted label, not a valid-looking address that belongs to somebody
 * else.
 */

test.each([
  ["TRON", "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE"],
  ["ETH", "0x52908400098527886E0F7030069857D2E4169EE7"],
  ["BSC", "0x8617E340B3D01FA5F11F306F4090FD50E238070D"],
  ["POLYGON", "0xde709f2102306220921060314715629080e2fb77"],
  // EIP-55's own examples, checksummed in mixed case.
  ["ETH", "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"],
  ["BSC", "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359"],
  ["POLYGON", "0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb"],
  ["TRON", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"],
  ["BTC", "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"],
  ["BTC", "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy"],
  ["BTC", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"],
  // BIP-173 (bech32) and BIP-350 (bech32m, taproot) examples.
  ["BTC", "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"],
  ["BTC", "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0"],
  ["SOL", "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV"],
  ["SOL", "So11111111111111111111111111111111111111112"],
])("a %s address in its own format is accepted", (network, address) => {
  expect(checkPayoutAddress(network, address)).toEqual({ ok: true });
});

test("a TRON address that is a character short is refused", () => {
  const result = checkPayoutAddress(
    "TRON",
    "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLS",
  );
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toMatch(/starts with T/);
});

test.each([
  // QA saved this one: right length, right letters, one character wrong.
  ["TRON", "TJBjEh1hxvpCbtnTGU1KFbbBv9Eq6p9a1b"],
  ["TRON", "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSF"],
  // One letter's case flipped in a checksummed Ethereum address.
  ["ETH", "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD"],
  ["BSC", "0xfb6916095ca1df60bB79Ce92cE3Ea74c37c5d359"],
  ["BTC", "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN3"],
  ["BTC", "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5"],
  ["BTC", "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj2"],
  // A character dropped from a 32-byte key.
  ["SOL", "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLt"],
])(
  "a mistyped %s address of the right shape is refused",
  (network, address) => {
    expect(checkPayoutAddress(network, address)).toEqual({
      ok: false,
      error: ADDRESS_TYPO,
    });
  },
);

test("the message reads as English", () => {
  const result = checkPayoutAddress("ETH", "0x123");
  expect(!result.ok && result.error).toMatch(
    /^That does not look like an ETH address\./,
  );
  const tron = checkPayoutAddress("TRON", "T123");
  expect(!tron.ok && tron.error).toMatch(
    /^That does not look like a TRON address\./,
  );
});

test("an address for another network is refused", () => {
  // An Ethereum address saved under TRON is the classic lost payout.
  expect(
    checkPayoutAddress("TRON", "0x52908400098527886E0F7030069857D2E4169EE7").ok,
  ).toBe(false);
  expect(
    checkPayoutAddress("ETH", "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE").ok,
  ).toBe(false);
});

test("characters base58 never uses are refused", () => {
  // 0, O, I and l do not exist in a TRON, Bitcoin or Solana address.
  expect(
    checkPayoutAddress("TRON", "TTestOnlyAddressForLocalRunNotRealx").ok,
  ).toBe(false);
});

test("a network the wallet does not offer is refused", () => {
  expect(
    checkPayoutAddress("DOGE", "DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L").ok,
  ).toBe(false);
});

test("the wallet offers exactly the networks this checks", () => {
  expect([...PAYOUT_NETWORKS]).toEqual([
    "TRON",
    "ETH",
    "BSC",
    "POLYGON",
    "BTC",
    "SOL",
  ]);
});

// ---------------------------------------------------------- transactions

const HEX = "a".repeat(32) + "0123456789abcdef".repeat(2);

test.each([
  ["TRON", HEX],
  ["BTC", HEX.toUpperCase()],
  ["ETH", `0x${HEX}`],
  ["BSC", `0x${HEX}`],
  ["POLYGON", `0x${HEX}`],
  [
    "SOL",
    "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW",
  ],
])("a %s transaction hash in its own format is taken", (network, hash) => {
  expect(checkTxHash(network, hash)).toEqual({ ok: true });
});

test("a hash that is not one is refused, with what one looks like", () => {
  // "abc" reached "Yes — it has been sent" on the payouts desk.
  for (const network of PAYOUT_NETWORKS) {
    const result = checkTxHash(network, "abc");
    expect(result.ok, network).toBe(false);
  }
  const tron = checkTxHash("TRON", `0x${HEX}`);
  expect(!tron.ok && tron.error).toBe(
    "That doesn't look like a TRON transaction hash. It is 64 characters, 0–9 and a–f, with no 0x.",
  );
  const eth = checkTxHash("ETH", HEX);
  expect(!eth.ok && eth.error).toMatch(/^That doesn't look like an ETH/);
  expect(checkTxHash("ETH", "   ")).toEqual({
    ok: false,
    error: "Paste the transaction hash — it is the only proof it was sent.",
  });
});
