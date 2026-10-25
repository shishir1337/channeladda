/**
 * Contact details in something a buyer reads: a phone number, an email, a
 * link or a messaging handle. Each is a way to take a deal off Channel Adda,
 * where nobody holds the money or the account and a scam has no comeback.
 *
 * One set of rules for the seller's bio and for every word on a listing, so
 * the two never disagree about what counts, and one message for both.
 *
 * Kept to what is plainly a way to reach somebody. "Instagram", "Gmail",
 * "since 2019" and "120000 views" are all things a listing says honestly.
 */

/** What every field that refuses contact details says. */
export const CONTACT_REFUSED =
  "Leave out links, emails and phone numbers: deals stay on Channel Adda.";

/** An address, or a handle: nothing else on a listing needs an @. */
const AT_SIGN = /@/;

/** A link, a bare domain, or a chat app's short link. */
const LINK =
  /https?:|www\.|\b(?:wa|t)\.me\b|\b(?:bit\.ly|discord\.gg)\b|\.(?:com|net|org|me|io|in|bd|pk|co|info|xyz|link)\b/i;

/** Nine digits or more, spaced or dashed as a phone number is written. */
const PHONE = /(?:\d[\s.()-]?){9,}/;

/**
 * An email spelled out to get past the @: "name at gmail dot com",
 * "name (at) gmail (dot) com", "name at the rate gmail.com".
 */
const SPELLED_EMAIL = [
  /[[(]\s*at\s*[\])]/i,
  // Not "grows at the rate of 2K a month".
  /\bat\s*the\s*rate\s+(?!of\b)[a-z0-9]/i,
  // The dot written as a dot is joined up, or "priced at cost. In 2023"
  // would read as an address.
  /\bat\s+[a-z0-9-]+(?:\.|\s*[[(]?\s*\bdot\b\s*[\])]?\s*)(?:com|net|org|in|io|me|co)\b/i,
  /\b(?:gmail|googlemail|yahoo|hotmail|outlook|proton(?:mail)?|icloud|ymail|rediffmail|aol)\s*[[(]?\s*\bdot\b\s*[\])]?\s*(?:com|net|me|in|co)\b/i,
];

/**
 * A messaging handle given by name: "WhatsApp number", "Skype id",
 * "Telegram me". Not "Signal", which crypto channels sell by the dozen; not
 * the platforms a listing is about — "Telegram" and "Instagram" are what is
 * being sold — and not "message me", which is what Channel Adda's own chat
 * is for.
 */
const MESSAGING =
  /\b(?:whats\s?app|skype|discord|snapchat|wechat|viber)\s*(?:id|handle|user\s?name|number|no\b\.?|num|me|us)\b|\b(?:telegram|tg)\s+(?:id|me)\b/i;

/**
 * True when `text` gives a way to reach somebody off the site.
 *
 * `allow` is the account's own handle: a listing may name the account it
 * is selling, "@desifooddiaries" or "desifood.com", where it stands alone —
 * not as the start of a link or an address, so it cannot open a gap.
 */
export function hasContactDetails(
  text: string,
  options: { allow?: string | null } = {},
): boolean {
  let rest = text;
  const own = (options.allow ?? "").trim().replace(/^@/, "");
  if (own.length >= 2) {
    const escaped = own.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    rest = rest.replace(
      new RegExp(`(?<![\\w.@/])@?${escaped}(?![\\w@/]|\\.\\w)`, "gi"),
      " ",
    );
  }
  return (
    AT_SIGN.test(rest) ||
    LINK.test(rest) ||
    PHONE.test(rest) ||
    MESSAGING.test(rest) ||
    SPELLED_EMAIL.some((pattern) => pattern.test(rest))
  );
}

/** Only the spelled-out email: for a name, which has its own stricter rule. */
export function hasSpelledEmail(text: string): boolean {
  return SPELLED_EMAIL.some((pattern) => pattern.test(text));
}
