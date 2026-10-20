import { expect, test } from "vitest";
import { checkPayoutAddress, PAYOUT_NETWORKS } from "@/lib/payout-address";

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
  ["BTC", "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"],
  ["BTC", "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy"],
  ["BTC", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"],
  ["SOL", "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV"],
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
