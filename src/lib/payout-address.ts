/**
 * Whether a payout address looks like an address on the network it is saved
 * under.
 *
 * A payout sent to a mistyped address is gone for good, and the only check
 * used to be a length of 20 to 120 characters, so any typo of the right
 * length — or an Ethereum address saved as TRON — passed. These are format
 * checks only: they catch a wrong network, a dropped character or a pasted
 * label, not a well-formed address that belongs to somebody else. That one
 * is what the 24-hour hold after a change and the finance desk's read-back
 * are for.
 */

/** The networks the wallet offers, in the order it offers them. */
export const PAYOUT_NETWORKS = [
  "TRON",
  "ETH",
  "BSC",
  "POLYGON",
  "BTC",
  "SOL",
] as const;

export type PayoutNetwork = (typeof PAYOUT_NETWORKS)[number];

/** Base58 has no 0, O, I or l: they are too easy to misread. */
const BASE58 = "[1-9A-HJ-NP-Za-km-z]";
const EVM = /^0x[0-9a-fA-F]{40}$/;

const FORMATS: Readonly<
  Record<PayoutNetwork, { pattern: RegExp; describe: string }>
> = {
  TRON: {
    pattern: new RegExp(`^T${BASE58}{33}$`),
    describe: "A TRON (TRC20) address starts with T and is 34 characters.",
  },
  ETH: {
    pattern: EVM,
    describe: "An Ethereum address starts with 0x and has 40 more characters.",
  },
  BSC: {
    pattern: EVM,
    describe:
      "A BNB Smart Chain address starts with 0x and has 40 more characters.",
  },
  POLYGON: {
    pattern: EVM,
    describe: "A Polygon address starts with 0x and has 40 more characters.",
  },
  BTC: {
    // Legacy and script addresses, or a lower-case bech32 one.
    pattern: new RegExp(
      `^(?:[13]${BASE58}{25,34}|bc1[ac-hj-np-z02-9]{11,71})$`,
    ),
    describe: "A Bitcoin address starts with 1, 3 or bc1.",
  },
  SOL: {
    pattern: new RegExp(`^${BASE58}{32,44}$`),
    describe: "A Solana address is 32 to 44 letters and numbers.",
  },
};

export function checkPayoutAddress(
  network: string,
  address: string,
): { ok: true } | { ok: false; error: string } {
  const format = FORMATS[network as PayoutNetwork];
  if (!format) return { ok: false, error: "Pick a network." };
  return format.pattern.test(address)
    ? { ok: true }
    : {
        ok: false,
        error: `That does not look like a ${network} address. ${format.describe}`,
      };
}
