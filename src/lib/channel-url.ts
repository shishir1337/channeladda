import type { Platform } from "@/generated/prisma/enums";

/**
 * Working out what a seller pasted.
 *
 * Sellers paste whatever they have: the channel link from the address bar, the
 * share link, the mobile one, a bare @handle, sometimes a video URL by
 * mistake. Asking them to type a handle instead got the handle wrong often
 * enough to matter — a wrong handle means the wrong subscriber count on a
 * listing somebody is about to pay thousands for.
 *
 * Pure, so every shape a human can paste is a test rather than a support
 * ticket.
 */
export type ParsedChannel = {
  platform: Platform;
  /**
   * How the account can be looked up.
   * - `id` is YouTube's own channel id, usable directly
   * - `handle` is an @name, resolvable via the API's forHandle
   * - `legacy` is a /c/ or /user/ name, which only search can resolve
   * - `domain` is a website, which has no API to ask
   */
  kind: "id" | "handle" | "legacy" | "domain";
  value: string;
};

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

const SOCIAL_HOSTS: ReadonlyArray<{ hosts: string[]; platform: Platform }> = [
  {
    hosts: ["instagram.com", "www.instagram.com"],
    platform: "INSTAGRAM",
  },
  {
    hosts: ["t.me", "telegram.me", "www.t.me"],
    platform: "TELEGRAM",
  },
  {
    hosts: ["facebook.com", "www.facebook.com", "m.facebook.com", "fb.com"],
    platform: "FACEBOOK",
  },
];

/**
 * First path words that are a page *on* the platform, not an account.
 *
 * A link to a post, a reel or a group is the most common wrong thing to
 * paste, and taking its first word as the account produced listings called
 * @reel and @p.
 */
const NOT_AN_ACCOUNT: Partial<Record<Platform, ReadonlySet<string>>> = {
  INSTAGRAM: new Set([
    "p",
    "reel",
    "reels",
    "stories",
    "explore",
    "tv",
    "accounts",
    "direct",
  ]),
  FACEBOOK: new Set([
    "groups",
    "watch",
    "events",
    "marketplace",
    "photo",
    "photo.php",
    "story.php",
    "permalink.php",
    "share",
    "reel",
  ]),
};

/** Only these two schemes. `javascript:` and friends never reach a fetch. */
function asUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // A bare word becomes https://word with no dot in it — not a link.
  if (!url.hostname.includes(".")) return null;
  return url;
}

export function parseChannelUrl(input: string): ParsedChannel | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // A bare @handle, which is what half of them have to hand.
  const bare = trimmed.match(/^@([A-Za-z0-9._-]{3,30})$/);
  if (bare) {
    return { platform: "YOUTUBE", kind: "handle", value: bare[1] };
  }

  const url = asUrl(trimmed);
  if (!url) return null;

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  if (YOUTUBE_HOSTS.has(host)) {
    const [first, second] = segments;
    if (!first) return null;

    if (first.startsWith("@")) {
      const handle = first.slice(1);
      return handle
        ? { platform: "YOUTUBE", kind: "handle", value: handle }
        : null;
    }
    if (first === "channel" && second) {
      return { platform: "YOUTUBE", kind: "id", value: second };
    }
    if ((first === "c" || first === "user") && second) {
      return { platform: "YOUTUBE", kind: "legacy", value: second };
    }
    // /watch, /shorts, /playlist and the rest are not channels. Accepting one
    // would quietly fetch the wrong account.
    return null;
  }

  for (const { hosts, platform } of SOCIAL_HOSTS) {
    if (!hosts.includes(host)) continue;
    // t.me/s/name is the web preview of t.me/name.
    const [first] =
      platform === "TELEGRAM" && segments[0] === "s" && segments[1]
        ? segments.slice(1)
        : segments;
    if (!first) return null;
    if (NOT_AN_ACCOUNT[platform]?.has(first.toLowerCase())) return null;
    return { platform, kind: "handle", value: first.replace(/^@/, "") };
  }

  // Anything else is a content website, identified by its domain.
  return {
    platform: "WEBSITE",
    kind: "domain",
    value: host.replace(/^www\./, ""),
  };
}

/**
 * The link, with the scheme a seller did not type.
 *
 * People paste what their browser shows them, which is routinely
 * “instagram.com/natgeo”. `parseChannelUrl` accepts that — it prepends the
 * scheme for its own parsing — but the listing schema refuses anything that
 * does not start `https://`, so handing the raw string back to the form
 * produced an error whose key nothing rendered: both buttons did nothing,
 * for ever, on an ordinary paste.
 *
 * A bare `@handle` comes back untouched, because the schema accepts it and
 * turning it into a URL would be guessing at a platform.
 */
export function normaliseChannelUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("@")) {
    return parseChannelUrl(trimmed) ? trimmed : null;
  }

  const url = asUrl(trimmed);
  if (!url || !parseChannelUrl(trimmed)) return null;

  // Rebuilt from the parsed URL rather than string-prefixed, so a stray
  // trailing slash or an uppercase host comes back the same every time.
  const base = `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, "")}`;

  // The one link whose account is in the query string: without its id, a
  // numbered Facebook profile link names nobody.
  const id = url.searchParams.get("id");
  if (url.pathname.endsWith("/profile.php") && id) {
    return `${base}?id=${encodeURIComponent(id)}`;
  }
  return base;
}

/** Path words that parse as a handle and are not one. */
const NOT_A_NAME = new Set(["profile.php", "joinchat"]);

/**
 * The handle a link carries, if it carries one.
 *
 * Separate from `parseChannelUrl` because that answers "how do I look this
 * up" and this answers "what goes in the handle field". They are the same
 * string for an @name and different for everything else: a channel id is not
 * a handle, a legacy /c/ name is a search term, and a domain is a domain.
 * Returning one of those would publish a listing called
 * UCBJycsmduvYEL83R_U4JriQ.
 */
export function handleFromUrl(input: string): string | null {
  const parsed = parseChannelUrl(input);
  return parsed?.kind === "handle" ? parsed.value : null;
}

/**
 * The handle to *suggest* in the form: `handleFromUrl`, but only when it is
 * something the listing's own handle rule would accept.
 *
 * An invite code ("+AbC"), a page name ("profile.php") or an encoded
 * non-Latin name is left for the seller to type, rather than filled in and
 * then refused on save. Deliberately not used by the ownership check, which
 * must always overwrite a typed handle with the verified channel's own.
 */
export function suggestHandle(input: string): string | null {
  const handle = handleFromUrl(input);
  if (!handle || NOT_A_NAME.has(handle.toLowerCase())) return null;
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(handle) ? handle : null;
}

/**
 * The alphabet for ownership codes.
 *
 * Crockford-style: no I, O, 1 or 0. Somebody is going to read this off a
 * screen and type it into YouTube's description box, and those four are where
 * that goes wrong. U is kept — it only causes trouble in words, and these are
 * not words.
 */
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/**
 * A one-time code the seller puts in their channel description so we can
 * prove they control it.
 *
 * Prefixed so it is obviously ours when a buyer sees it on a live channel and
 * wonders what it is. Eight characters from a 32-character alphabet is 40
 * bits, which is far more than enough for a code that is checked once and
 * never guessed at.
 */
export function newOwnershipCode(): string {
  // Web Crypto rather than node:crypto, so the listing form can use the link
  // parsing above in the browser. With exactly 32 symbols, the low five bits
  // of a random byte pick one uniformly — 256 is a multiple of 32 — so there
  // is no bias to correct for. Change the alphabet's length and this has to
  // change with it.
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let code = "";
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte & 31];
  }
  return `CA-${code}`;
}

/** Whether a blob of channel text contains the code we issued. */
export function containsOwnershipCode(text: string, code: string): boolean {
  if (!code) return false;
  // Case-insensitive and whitespace-tolerant: people paste it with a line
  // break in the middle or lowercase it, and refusing that is pedantry.
  const normalise = (value: string) => value.replace(/\s+/g, "").toUpperCase();
  return normalise(text).includes(normalise(code));
}
