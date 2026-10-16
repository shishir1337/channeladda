import { randomInt } from "node:crypto";
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
    const [first] = segments;
    if (!first) return null;
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
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
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
