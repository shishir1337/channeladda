import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vitest";

/**
 * The promises the product no longer makes, kept out of the code for good.
 *
 * A Safest buyer used to pay the channel's price to Channel Adda, and a
 * Fastest seller used to wait out a recovery hold after the handover. Since
 * the client's flows of 2026-10-20 neither is true: a Safest buyer pays the
 * seller directly once our agent holds the channel, and a Fastest deal's
 * hold runs while the buyer is a manager, before the handover. A page that
 * still described either would send a buyer to a checkout that no longer
 * exists, or tell a seller to wait for money that is already theirs. Copy
 * lives in pages, data files, components and emails alike, so the whole of
 * src is read.
 */
const BANNED: readonly RegExp[] = [
  // The Safest price, paid to us between the two transfers.
  /(pay|pays|paid|paying) the (channel's )?price to (channel adda|us)/i,
  /price to (channel adda|us),? (later|once|after|then)/i,
  /price (is )?paid to (channel adda|us)/i,
  /the (account|channel) and then the money/i,
  /then,? to (channel adda|us) once/i,
  /safest deal[^.]*money is with us/i,
  /money,? and on safest the account too/i,
  /(account|channel), and the price too/i,
  // The Fastest hold that ran after the handover, and Safest's two holds.
  /recovery hold/i,
  // A Safest buyer pays the seller directly, so this is only true of
  // Fastest and must never be said of both.
  /(?<!fastest deal )you pay channel adda, never the seller/i,
  /\bhold [12]\b/i,
];

const ROOT = join(__dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === "generated" ? [] : sources(path);
    }
    if (!/\.(ts|tsx)$/.test(name) || /\.test\.tsx?$/.test(name)) return [];
    return [path];
  });
}

test("no page describes the deal flows the product replaced", () => {
  const offenders: string[] = [];
  for (const file of sources(ROOT)) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (BANNED.some((pattern) => pattern.test(line))) {
          offenders.push(
            `${relative(ROOT, file)}:${index + 1}: ${line.trim().slice(0, 120)}`,
          );
        }
      });
  }
  expect(offenders, offenders.join("\n")).toEqual([]);
});
