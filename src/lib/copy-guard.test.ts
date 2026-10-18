import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vitest";

/**
 * The promise the product no longer makes, kept out of the code for good.
 *
 * Safest used to send the buyer to pay the seller directly. It does not any
 * more — on both kinds of deal the buyer pays Channel Adda — and a page that
 * still told someone to pay a seller would be telling them to do the one
 * thing our Trust & Safety page calls a scam. Copy lives in pages, data
 * files, components and emails alike, so the whole of src is read.
 *
 * Moderation wording about people taking a deal off the platform is fine;
 * only payment phrasing is banned.
 */
const BANNED: readonly RegExp[] = [
  /pays? the seller directly/i,
  /paid (to )?the seller directly/i,
  /never holds? the (channel's )?price/i,
  /(price|seller)[^.\n]{0,40}off-platform/i,
  /paid off-platform/i,
  /paid direct\b/i,
  /price never (passes|passed|reaches|touches)/i,
  /buyer pays the seller/i,
  /pays you directly/i,
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

test("no page tells anyone to pay a seller directly", () => {
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
