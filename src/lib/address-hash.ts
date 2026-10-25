/**
 * The three pieces a wallet address's own checksum is built from: SHA-256
 * (TRON and Bitcoin, twice over), Keccak-256 (Ethereum's mixed-case check)
 * and base58 (how TRON, Bitcoin and Solana write their bytes).
 *
 * Written out here rather than taken from Node's crypto because the wallet
 * form runs the same check in the browser, and Web Crypto's digest is
 * asynchronous. Each is the textbook algorithm, small inputs only, and is
 * held to the published test vectors in `address-hash.test.ts`.
 */

// ---------------------------------------------------------------- SHA-256

const K = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

export function sha256(data: Uint8Array): Uint8Array {
  const h = Uint32Array.from([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = data.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bits / 2 ** 32));
  view.setUint32(padded.length - 4, bits >>> 0);

  const w = new Uint32Array(64);
  for (let block = 0; block < padded.length; block += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(block + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const t1 =
        (hh +
          (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) +
          ((e & f) ^ (~e & g)) +
          K[t] +
          w[t]) >>>
        0;
      const t2 =
        ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) +
          ((a & b) ^ (a & c) ^ (b & c))) >>>
        0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i]);
  return out;
}

// ------------------------------------------------------------- Keccak-256

const MASK = BigInt("0xffffffffffffffff");

const ROUND = [
  "0x0000000000000001",
  "0x0000000000008082",
  "0x800000000000808a",
  "0x8000000080008000",
  "0x000000000000808b",
  "0x0000000080000001",
  "0x8000000080008081",
  "0x8000000000008009",
  "0x000000000000008a",
  "0x0000000000000088",
  "0x0000000080008009",
  "0x000000008000000a",
  "0x000000008000808b",
  "0x800000000000008b",
  "0x8000000000008089",
  "0x8000000000008003",
  "0x8000000000008002",
  "0x8000000000000080",
  "0x000000000000800a",
  "0x800000008000000a",
  "0x8000000080008081",
  "0x8000000000008080",
  "0x0000000080000001",
  "0x8000000080008008",
].map((hex) => BigInt(hex));

/** Rotation for the lane at x + 5y, indexed that way. */
const RHO = [
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18,
  2, 61, 56, 14,
];

function rotl(value: bigint, n: number): bigint {
  if (n === 0) return value;
  return ((value << BigInt(n)) | (value >> BigInt(64 - n))) & MASK;
}

function keccakF(state: bigint[]) {
  const c = new Array<bigint>(5);
  const b = new Array<bigint>(25);
  for (let round = 0; round < 24; round++) {
    for (let x = 0; x < 5; x++) {
      c[x] =
        state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1);
      for (let y = 0; y < 25; y += 5) state[x + y] ^= d;
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(
          state[x + 5 * y],
          RHO[x + 5 * y],
        );
      }
    }
    for (let y = 0; y < 25; y += 5) {
      for (let x = 0; x < 5; x++) {
        state[x + y] =
          b[x + y] ^ (~b[((x + 1) % 5) + y] & MASK & b[((x + 2) % 5) + y]);
      }
    }
    state[0] ^= ROUND[round];
  }
}

/** Keccak-256 as Ethereum uses it: the original padding, not SHA-3's. */
export function keccak256(data: Uint8Array): Uint8Array {
  const rate = 136;
  const padded = new Uint8Array((Math.floor(data.length / rate) + 1) * rate);
  padded.set(data);
  padded[data.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;

  const state = new Array<bigint>(25).fill(BigInt(0));
  for (let block = 0; block < padded.length; block += rate) {
    for (let lane = 0; lane < rate / 8; lane++) {
      let value = BigInt(0);
      for (let byte = 7; byte >= 0; byte--) {
        value = (value << BigInt(8)) | BigInt(padded[block + lane * 8 + byte]);
      }
      state[lane] ^= value;
    }
    keccakF(state);
  }

  const out = new Uint8Array(32);
  for (let lane = 0; lane < 4; lane++) {
    let value = state[lane];
    for (let byte = 0; byte < 8; byte++) {
      out[lane * 8 + byte] = Number(value & BigInt(0xff));
      value >>= BigInt(8);
    }
  }
  return out;
}

// ----------------------------------------------------------------- base58

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** The bytes a base58 string stands for, or null if it is not base58. */
export function base58Decode(text: string): Uint8Array | null {
  const bytes: number[] = [];
  for (const char of text) {
    let carry = BASE58_ALPHABET.indexOf(char);
    if (carry < 0) return null;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of text) {
    if (char !== "1") break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

/**
 * Base58 with a checksum, as TRON and Bitcoin write an address: the payload,
 * then the first four bytes of SHA-256 run twice over it. The payload, or
 * null when the checksum does not match — which is what a mistyped character
 * almost always does.
 */
export function base58CheckDecode(text: string): Uint8Array | null {
  const bytes = base58Decode(text);
  if (!bytes || bytes.length < 5) return null;
  const payload = bytes.subarray(0, bytes.length - 4);
  const sum = sha256(sha256(payload));
  for (let i = 0; i < 4; i++) {
    if (sum[i] !== bytes[bytes.length - 4 + i]) return null;
  }
  return payload;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
