import { parseChannelUrl, suggestHandle } from "@/lib/channel-url";

/**
 * Filling a listing from a fetched channel, and taking it back out.
 *
 * Pure, so the rules a seller depends on are tests rather than hopes: a
 * fetch fills every blank the channel can answer, never touches what the
 * seller typed, can be corrected by fetching the right channel, and can be
 * undone exactly.
 */

/** The part of the listing form a fetch can write to. */
export type ImportableDraft = {
  platform: string;
  sourceUrl: string;
  handle: string;
  title: string;
  niche: string;
  country: string;
  audience: string;
  ageYears: string;
  engagement: string;
  avatarUrl: string | null;
  coverUrl: string | null;
};

/** The part of a lookup's answer that fills the form. */
export type ImportableChannel = {
  platform: string;
  canonicalUrl: string;
  handle: string | null;
  title: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  subscribers: number;
  ageYears: number;
  country: string | null;
  niche: string | null;
  engagement: number | null;
};

/** The fields a fetch can fill, in the order the form shows them. */
export const IMPORT_KEYS = [
  "title",
  "handle",
  "avatarUrl",
  "coverUrl",
  "audience",
  "ageYears",
  "country",
  "niche",
  "engagement",
] as const;

export type ImportKey = (typeof IMPORT_KEYS)[number];

/**
 * The handle a link gives, for the form: the @name on a social link, the
 * domain for a website, nothing otherwise. Only ever a suggestion — the
 * seller can change it, and the ownership check overwrites it with the
 * verified channel's own.
 */
export function handleForLink(link: string, platform: string): string {
  const fromLink = suggestHandle(link);
  if (fromLink) return fromLink;
  if (platform === "website") {
    const parsed = parseChannelUrl(link);
    if (parsed?.kind === "domain") return parsed.value;
  }
  return "";
}

/**
 * The channel's own name, as the listing title.
 *
 * Lengthened only when it is under the ten characters a title needs
 * ("MKBHD" → "MKBHD — YouTube channel"), and cut at the 120 it allows — a
 * Telegram title can run to 128.
 */
export function listingTitleFor(name: string, platformName: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const title =
    trimmed.length >= 10 ? trimmed : `${trimmed} — ${platformName} channel`;
  return title.length > 120 ? `${title.slice(0, 119).trimEnd()}…` : title;
}

/**
 * What one text field becomes.
 *
 * Blanks are filled, and so is anything the *previous* fetch put there —
 * which is what makes fetching the wrong channel first recoverable. Anything
 * the seller typed is left exactly as they typed it.
 *
 * A saved listing hands its blank figures back as "0" — the columns are not
 * nullable — so a zero counts as blank wherever the channel has a real
 * figure to offer. Without that, a fetch on the edit page filled nothing.
 */
function take(
  current: string,
  wasFilled: string,
  next: string,
  zeroIsBlank = false,
) {
  // Even when `next` is blank: a value the wrong channel filled must not
  // survive fetching the right one.
  if (current.trim() === "" || current === wasFilled) return next;
  if (zeroIsBlank && next !== "" && Number(current) === 0) return next;
  return current;
}

/** A picture: a saved listing with none hands back "", not null. */
function picture(
  current: string | null,
  wasFilled: string | null | undefined,
  next: string | null,
) {
  return !current || current === wasFilled ? (next ?? current) : current;
}

const figure = (value: number | null | undefined, positive = true) =>
  value === null || value === undefined || (positive && value <= 0)
    ? ""
    : String(value);

/**
 * The form after a fetch, and which fields it actually changed.
 *
 * `previous` is the channel the last fetch filled from, if any.
 */
export function mergeImport<T extends ImportableDraft>(
  current: T,
  channel: ImportableChannel,
  previous: ImportableChannel | null,
  platformName: string,
): { next: T; filled: ImportKey[] } {
  const titleOf = (c: ImportableChannel | null) =>
    c ? listingTitleFor(c.title, platformName) : "";

  const next: T = {
    ...current,
    platform: channel.platform.toLowerCase() || current.platform,
    sourceUrl: channel.canonicalUrl || current.sourceUrl,
    title: take(current.title, titleOf(previous), titleOf(channel)),
    // The handle, not the display title: "Daily Tech Brief" is not
    // @dailytechbrief, and the slug and the public URL are built from this.
    // One the link suggested gives way to the channel's own.
    handle:
      current.handle === handleForLink(current.sourceUrl, current.platform)
        ? channel.handle || current.handle
        : take(current.handle, previous?.handle ?? "", channel.handle ?? ""),
    // The description is deliberately not taken. A channel's about text is
    // written for viewers and routinely carries a business email — on a
    // listing that is an invitation to deal off the platform.
    avatarUrl: picture(
      current.avatarUrl,
      previous?.avatarUrl,
      channel.avatarUrl,
    ),
    coverUrl: picture(current.coverUrl, previous?.coverUrl, channel.coverUrl),
    audience: take(
      current.audience,
      figure(previous?.subscribers),
      figure(channel.subscribers),
      true,
    ),
    ageYears: take(
      current.ageYears,
      figure(previous?.ageYears),
      figure(channel.ageYears),
      true,
    ),
    country: take(
      current.country,
      previous?.country ?? "",
      channel.country ?? "",
    ),
    niche: take(current.niche, previous?.niche ?? "", channel.niche ?? ""),
    engagement: take(
      current.engagement,
      figure(previous?.engagement, false),
      figure(channel.engagement, false),
      true,
    ),
  };

  const filled = IMPORT_KEYS.filter(
    (key) => next[key] && next[key] !== current[key],
  );
  return { next, filled };
}

/**
 * The form with a fetch taken back out: every field the fetch set returns to
 * what it was before — unless the seller has changed it since, in which case
 * their change stands.
 */
export function undoImport<T extends ImportableDraft>(
  current: T,
  before: T,
  after: T,
): T {
  const undone: T = { ...current };
  for (const key of ["platform", "sourceUrl", ...IMPORT_KEYS] as const) {
    if (current[key] === after[key]) {
      (undone as ImportableDraft)[key] = before[key] as never;
    }
  }
  return undone;
}
