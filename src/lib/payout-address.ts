import {
  base58CheckDecode,
  base58Decode,
  keccak256,
  toHex,
} from "@/lib/address-hash";

/**
 * Whether a payout address is a real address on the network it is saved
 * under.
 *
 * A payout sent to a mistyped address is gone for good. The format comes
 * first — it catches a wrong network, a dropped character or a pasted label
 * — and then the address's own checksum, which is what catches a typo of the
 * right length: QA saved a TRON address with one character changed, and the
 * old "starts with T, 34 characters" let it through. Neither catches a real
 * address that belongs to somebody else; that is what the 24-hour hold
 * after a change and the finance desk's read-back are for.
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

/** A wrong character in an address of the right shape. */
export const ADDRESS_TYPO =
  "That address doesn't look right — check every character.";

/** "a TRON address", but "an ETH address": ETH is said a letter at a time. */
const named = (network: string) =>
  `${network === "ETH" ? "an" : "a"} ${network}`;

const FORMATS: Readonly<
  Record<
    PayoutNetwork,
    { pattern: RegExp; describe: string; checksum: (a: string) => boolean }
  >
> = {
  TRON: {
    pattern: new RegExp(`^T${BASE58}{33}$`),
    describe: "A TRON (TRC20) address starts with T and is 34 characters.",
    checksum: tronChecksum,
  },
  ETH: {
    pattern: EVM,
    describe: "An Ethereum address starts with 0x and has 40 more characters.",
    checksum: evmChecksum,
  },
  BSC: {
    pattern: EVM,
    describe:
      "A BNB Smart Chain address starts with 0x and has 40 more characters.",
    checksum: evmChecksum,
  },
  POLYGON: {
    pattern: EVM,
    describe: "A Polygon address starts with 0x and has 40 more characters.",
    checksum: evmChecksum,
  },
  BTC: {
    // Legacy and script addresses, or a lower-case bech32 one.
    pattern: new RegExp(
      `^(?:[13]${BASE58}{25,34}|bc1[ac-hj-np-z02-9]{11,71})$`,
    ),
    describe: "A Bitcoin address starts with 1, 3 or bc1.",
    checksum: bitcoinChecksum,
  },
  SOL: {
    pattern: new RegExp(`^${BASE58}{32,44}$`),
    describe: "A Solana address is 32 to 44 letters and numbers.",
    // Solana carries no checksum; a public key is exactly 32 bytes, which
    // a dropped or doubled character usually breaks.
    checksum: (address) => base58Decode(address)?.length === 32,
  },
};

export function checkPayoutAddress(
  network: string,
  address: string,
): { ok: true } | { ok: false; error: string } {
  const format = FORMATS[network as PayoutNetwork];
  if (!format) return { ok: false, error: "Pick a network." };
  if (!format.pattern.test(address)) {
    return {
      ok: false,
      error: `That does not look like ${named(network)} address. ${format.describe}`,
    };
  }
  return format.checksum(address)
    ? { ok: true }
    : { ok: false, error: ADDRESS_TYPO };
}

/** Base58check, with TRON's version byte 0x41 in front of 20 bytes. */
function tronChecksum(address: string): boolean {
  const payload = base58CheckDecode(address);
  return payload?.length === 21 && payload[0] === 0x41;
}

/**
 * EIP-55: in a mixed-case address the case of each letter is the checksum.
 * All lower or all upper case carries none, and is taken as typed.
 */
function evmChecksum(address: string): boolean {
  const hex = address.slice(2);
  if (hex === hex.toLowerCase() || hex === hex.toUpperCase()) return true;
  const hash = toHex(keccak256(new TextEncoder().encode(hex.toLowerCase())));
  for (let i = 0; i < hex.length; i++) {
    const char = hex[i];
    if (!/[a-f]/i.test(char)) continue;
    const upper = Number.parseInt(hash[i], 16) >= 8;
    if ((char === char.toUpperCase()) !== upper) return false;
  }
  return true;
}

/** Base58check for 1… and 3…, bech32 or bech32m for bc1…. */
function bitcoinChecksum(address: string): boolean {
  if (!address.startsWith("bc1")) {
    const payload = base58CheckDecode(address);
    return (
      payload?.length === 21 && (payload[0] === 0x00 || payload[0] === 0x05)
    );
  }
  return segwitValid(address);
}

const BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let check = 1;
  for (const value of values) {
    const top = check >>> 25;
    check = ((check & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) check ^= GENERATOR[i];
    }
  }
  return check >>> 0;
}

/** BIP-173 and BIP-350: version 0 is bech32, 1 and up bech32m. */
function segwitValid(address: string): boolean {
  const split = address.lastIndexOf("1");
  const hrp = address.slice(0, split);
  const data = Array.from(address.slice(split + 1), (c) => BECH32.indexOf(c));
  if (hrp !== "bc" || data.length < 7 || data.some((v) => v < 0)) return false;

  const expanded = [
    ...Array.from(hrp, (c) => c.charCodeAt(0) >> 5),
    0,
    ...Array.from(hrp, (c) => c.charCodeAt(0) & 31),
  ];
  const check = polymod([...expanded, ...data]);
  const version = data[0];
  if (version > 16) return false;
  if (check !== (version === 0 ? 1 : 0x2bc830a3)) return false;

  // The witness program, regrouped from 5 bits to 8.
  let acc = 0;
  let bits = 0;
  const program: number[] = [];
  for (const value of data.slice(1, -6)) {
    acc = ((acc << 5) | value) & 0xffff;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      program.push((acc >> bits) & 0xff);
    }
  }
  if (bits >= 5 || ((acc << (8 - bits)) & 0xff) !== 0) return false;
  if (program.length < 2 || program.length > 40) return false;
  return version !== 0 || program.length === 20 || program.length === 32;
}

// -------------------------------------------------------- transactions

const HEX_64 = /^[0-9a-fA-F]{64}$/;
const EVM_HASH = /^0x[0-9a-fA-F]{64}$/;

const HASHES: Readonly<
  Record<PayoutNetwork, { valid: (hash: string) => boolean; describe: string }>
> = {
  TRON: {
    valid: (hash) => HEX_64.test(hash),
    describe: "It is 64 characters, 0–9 and a–f, with no 0x.",
  },
  ETH: {
    valid: (hash) => EVM_HASH.test(hash),
    describe: "It starts with 0x and has 64 more characters, 0–9 and a–f.",
  },
  BSC: {
    valid: (hash) => EVM_HASH.test(hash),
    describe: "It starts with 0x and has 64 more characters, 0–9 and a–f.",
  },
  POLYGON: {
    valid: (hash) => EVM_HASH.test(hash),
    describe: "It starts with 0x and has 64 more characters, 0–9 and a–f.",
  },
  BTC: {
    valid: (hash) => HEX_64.test(hash),
    describe: "It is 64 characters, 0–9 and a–f.",
  },
  SOL: {
    // A signature: 64 bytes, in base58.
    valid: (hash) =>
      new RegExp(`^${BASE58}{64,90}$`).test(hash) &&
      base58Decode(hash)?.length === 64,
    describe: "It is a signature of 87 or 88 letters and numbers.",
  },
};

/**
 * Whether a transaction hash finance pastes is one on the payout's network.
 * It is the only proof the money left, and "abc" used to settle a payout.
 */
export function checkTxHash(
  network: string,
  hash: string,
): { ok: true } | { ok: false; error: string } {
  const trimmed = hash.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: "Paste the transaction hash — it is the only proof it was sent.",
    };
  }
  const rule = HASHES[network as PayoutNetwork];
  // A payout saved before the networks were fixed: anything hash-shaped.
  if (!rule) {
    return /^(?:0x)?[0-9a-fA-F]{64}$|^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(
      trimmed,
    )
      ? { ok: true }
      : {
          ok: false,
          error: "That doesn't look like a transaction hash. Copy it again.",
        };
  }
  return rule.valid(trimmed)
    ? { ok: true }
    : {
        ok: false,
        error: `That doesn't look like ${named(network)} transaction hash. ${rule.describe}`,
      };
}
