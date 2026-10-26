/**
 * Numbers as people type them, for every number field on the site.
 *
 * `Number("30,500")` is NaN, and NaN is how a form says "left blank": a
 * draft saved "30,500" followers and a "1,250" price as 0, and the live
 * edit and the withdraw form answered "1,250" and "$20" with "Enter an
 * amount." — as if nothing had been typed. These read what people
 * actually write, and give NaN only for what cannot be read, so the form
 * can say what to type (`UNREADABLE`) instead of storing a zero.
 *
 * A comma is read only as a thousands comma — "30,500", or "3,05,000" as
 * lakhs are written — and refused anywhere else: "1,25" is 1.25 to half
 * the world and 125 to nobody, so it is never guessed at.
 */

/** What to type, said when a number field holds something unreadable. */
export const UNREADABLE = {
  amount: "Type the amount in dollars, like 1250 or 1,250.",
  count: "Type the number only, like 30500 or 30,500.",
  years: "Type the number of years, like 3.",
  percent: "Type the rate as a number, like 4.5.",
} as const;

const DECIMAL = /^(\d+(\.\d+)?|\.\d+)$/;

/**
 * "30,500" to "30500", and null when a comma is not a thousands comma.
 * The first group has one to three digits, the last exactly three, and any
 * between two or three (lakhs: "12,34,567").
 */
function withoutThousands(text: string): string | null {
  if (!text.includes(",")) return text;
  const [whole, ...fraction] = text.split(".");
  if (fraction.length > 1) return null;
  const [first, ...rest] = whole.split(",");
  const last = rest.at(-1);
  if (!/^\d{1,3}$/.test(first) || !last || !/^\d{3}$/.test(last)) return null;
  if (!rest.slice(0, -1).every((group) => /^\d{2,3}$/.test(group))) {
    return null;
  }
  const digits = [first, ...rest].join("");
  return fraction.length > 0 ? `${digits}.${fraction[0]}` : digits;
}

function read(text: string): number {
  const plain = withoutThousands(text);
  return plain !== null && DECIMAL.test(plain) ? Number(plain) : Number.NaN;
}

/**
 * Dollars: "1250", "1,250", "$1,250.00", "1 250", "1250 USD". NaN for
 * anything else, a minus sign included.
 */
export function parseAmount(raw: string): number {
  const text = raw
    .replace(/\s+/g, "")
    .replace(/usd$/i, "")
    .replace(/^\$|\$$/g, "");
  return read(text);
}

/**
 * Followers, members, visits, years: "30500", "30,500", "30 500",
 * "3,05,000". A fraction is read as one, so the field can say "whole
 * numbers only" rather than "not a number".
 */
export function parseCount(raw: string): number {
  return read(raw.replace(/\s+/g, ""));
}

/**
 * A rate: "4.5", "4.5%", and "4,5" — no rate reaches a thousand, so a
 * comma here can only be a decimal point.
 */
export function parsePercent(raw: string): number {
  let text = raw.replace(/\s+/g, "").replace(/%$/, "");
  if (/^\d+,\d+$/.test(text)) text = text.replace(",", ".");
  return DECIMAL.test(text) ? Number(text) : Number.NaN;
}
