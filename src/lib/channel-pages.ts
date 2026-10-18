/**
 * Reading an account's public facts off the page anyone can open.
 *
 * The YouTube Data API is the proper source and is used when a key is
 * configured. Without one — and on the day the shared quota runs out — the
 * channel's own /about page carries the same facts a buyer would read there:
 * the name, the picture, the banner, the subscriber, video and view counts,
 * the country and the day it joined. Telegram has no API for this at all, but
 * its public t.me page prints the exact member count.
 *
 * Pure, and kept apart from the fetching, so every shape these pages come in
 * is a test rather than a surprise in production. The pages change; when one
 * does, these return null and the seller types the figures in, which is how
 * the form worked before any of this existed.
 */

/**
 * How these pages are asked for.
 *
 * An honest name rather than a browser's, and English, because the counts
 * and the "Joined" line are read in English. `SOCS=CAI` declines YouTube's
 * cookie banner, which otherwise replaces the page for visitors from the EU.
 */
export const PAGE_HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; ChannelAdda/1.0; listing lookup)",
  "accept-language": "en-US,en;q=0.9",
  cookie: "SOCS=CAI",
};

// ------------------------------------------------------------------ numbers

const SCALE: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  b: 1_000_000_000,
};

/**
 * "21.4M subscribers", "1,859 videos", "10 337 817 subscribers" → a number.
 *
 * Null when there is no figure in it. Never zero: a zero would be filled in
 * as though it were a fact about the account.
 */
export function parseCount(text: string): number | null {
  const match = text
    .replace(/[  ]/g, " ")
    .match(/(\d[\d,\s]*(?:\.\d+)?)\s*([KMB])?\b/i);
  if (!match) return null;

  const digits = Number(match[1].replace(/[,\s]/g, ""));
  if (!Number.isFinite(digits)) return null;
  const scale = match[2] ? SCALE[match[2].toLowerCase()] : 1;
  return Math.round(digits * scale);
}

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/** "Joined Mar 21, 2008" → that day, in UTC. */
export function parseJoinedDate(text: string): Date | null {
  const match = text.match(
    /Joined\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s+(\d{4})/,
  );
  if (!match) return null;
  const month = MONTHS.indexOf(match[1].toLowerCase());
  if (month < 0) return null;
  return new Date(Date.UTC(Number(match[3]), month, Number(match[2])));
}

/** Completed years, the way a person counts their age. */
export function wholeYearsSince(date: Date, now: Date = new Date()): number {
  let years = now.getUTCFullYear() - date.getUTCFullYear();
  const beforeAnniversary =
    now.getUTCMonth() < date.getUTCMonth() ||
    (now.getUTCMonth() === date.getUTCMonth() &&
      now.getUTCDate() < date.getUTCDate());
  if (beforeAnniversary) years -= 1;
  return Math.max(0, years);
}

const round1 = (value: number) => Math.round(value * 10) / 10;

// ------------------------------------------------------------------ YouTube

const YOUTUBE_IMAGE_HOSTS = new Set([
  "yt3.googleusercontent.com",
  "yt3.ggpht.com",
]);

function youtubeImage(url: unknown): URL | null {
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" &&
      YOUTUBE_IMAGE_HOSTS.has(parsed.hostname)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/**
 * The whole banner, 1600×900, from any size of it.
 *
 * The page links the narrow strip a desktop shows (about 6:1), which a
 * listing card would crop to a sliver of text. The same image at
 * `fcrop64=1,00000000ffffffff` is uncropped, with the strip across its
 * middle — the part a card keeps.
 */
export function fullBannerUrl(url: string): string | null {
  const parsed = youtubeImage(url);
  if (!parsed) return null;
  const base = parsed.href.split("=")[0];
  return `${base}=w1600-fcrop64=1,00000000ffffffff-k-c0xffffffff-no-nd-rj`;
}

/** The avatar at 512px — twice the largest size anything here draws it. */
function avatarAt512(url: unknown): string | null {
  const parsed = youtubeImage(url);
  if (!parsed) return null;
  return parsed.href.replace(/=s\d+-/, "=s512-");
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null;

/**
 * The page's data blob. YouTube writes it as a plain object literal that is
 * also valid JSON, under one of two names.
 */
function initialData(html: string): Json | null {
  for (const marker of ["var ytInitialData = ", 'window["ytInitialData"] = ']) {
    const at = html.indexOf(marker);
    if (at < 0) continue;
    const start = at + marker.length;
    const end = html.indexOf(";</script>", start);
    if (end < 0) continue;
    try {
      const parsed: unknown = JSON.parse(html.slice(start, end));
      return isObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** The first value stored under `key`, anywhere in the blob. */
function find(value: unknown, key: string, depth = 0): unknown {
  if (!isObject(value) || depth > 64) return undefined;
  if (key in value) return value[key];
  for (const child of Object.values(value)) {
    const found = find(child, key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** YouTube's text comes as a string, `{simpleText}`, `{content}` or runs. */
function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (!isObject(value)) return "";
  if (typeof value.simpleText === "string") return value.simpleText;
  if (typeof value.content === "string") return value.content;
  if (Array.isArray(value.runs)) {
    return value.runs
      .map((run) =>
        isObject(run) && typeof run.text === "string" ? run.text : "",
      )
      .join("");
  }
  return "";
}

function handleIn(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const match = url.match(/youtube\.com\/@([^/?#]+)/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export type PublicYouTubeChannel = {
  channelId: string;
  title: string;
  description: string;
  /** The @name without the at sign, when the channel has one. */
  handle: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  /** Null when the channel hides it. */
  subscribers: number | null;
  videos: number | null;
  views: number | null;
  country: string | null;
  joinedAt: Date | null;
};

/**
 * A channel's /about page, read.
 *
 * The counts come from the about panel specifically. The same page carries
 * featured channels with their own subscriber counts, and the first count on
 * the page is not necessarily this channel's.
 */
export function parseYouTubeAboutPage(
  html: string,
): PublicYouTubeChannel | null {
  const data = initialData(html);
  if (!data) return null;

  const metaNode = find(data.metadata, "channelMetadataRenderer");
  const meta = isObject(metaNode) ? metaNode : {};
  const aboutNode = find(data, "aboutChannelViewModel");
  const about = isObject(aboutNode) ? aboutNode : {};

  const channelId =
    (typeof about.channelId === "string" && about.channelId) ||
    (typeof meta.externalId === "string" && meta.externalId) ||
    null;
  if (!channelId) return null;

  const thumbnails = find(meta.avatar, "thumbnails");
  const avatar = Array.isArray(thumbnails) ? thumbnails.at(-1) : undefined;

  const sources = find(find(data.header, "imageBannerViewModel"), "sources");
  const banner = Array.isArray(sources) ? sources.at(-1) : undefined;

  const count = (value: unknown) => {
    const text = textOf(value);
    return text ? parseCount(text) : null;
  };

  return {
    channelId,
    title: typeof meta.title === "string" ? meta.title : "",
    description:
      (typeof about.description === "string" && about.description) ||
      (typeof meta.description === "string" && meta.description) ||
      "",
    handle:
      handleIn(about.canonicalChannelUrl) ?? handleIn(meta.vanityChannelUrl),
    avatarUrl: avatarAt512(isObject(avatar) ? avatar.url : undefined),
    bannerUrl:
      isObject(banner) && typeof banner.url === "string"
        ? fullBannerUrl(banner.url)
        : null,
    subscribers: count(about.subscriberCountText),
    videos: count(about.videoCountText),
    views: count(about.viewCountText),
    country:
      typeof about.country === "string" && about.country ? about.country : null,
    joinedAt: parseJoinedDate(textOf(about.joinedDateText)),
  };
}

// ---------------------------------------------------------------- the API's

/** Topic links that describe nearly every channel, so say nothing. */
const CATCH_ALL_TOPICS = new Set([
  "Lifestyle",
  "Society",
  "Entertainment",
  "Hobby",
  "Knowledge",
]);

/**
 * The API's topic links (Wikipedia URLs) → a niche a buyer would filter on.
 */
export function nicheFromTopics(urls: string[]): string | null {
  const labels = urls
    .map((url) => {
      const page = url.split("/wiki/")[1] ?? "";
      let label = page;
      try {
        label = decodeURIComponent(page);
      } catch {
        // Keep it as it came.
      }
      return label
        .replace(/_/g, " ")
        .replace(/\s*\(.*\)\s*$/, "")
        .trim();
    })
    .filter(Boolean);
  const niche =
    labels.find((label) => !CATCH_ALL_TOPICS.has(label)) ?? labels[0] ?? null;
  return niche ? (BUYERS_WORD[niche] ?? niche) : null;
}

/** Google's topic names where a buyer would search for another word. */
const BUYERS_WORD: Record<string, string> = {
  // YouTube's tag for science and teaching channels.
  Knowledge: "Education",
};

/** "US" → "United States": the API gives a code, the form asks for a name. */
export function countryName(code: string): string | null {
  if (!/^[A-Za-z]{2}$/.test(code)) return null;
  try {
    const upper = code.toUpperCase();
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(upper);
    return name && name !== upper ? name : null;
  } catch {
    return null;
  }
}

/**
 * Likes and comments as a share of views, over the most recent videos.
 *
 * Null below three videos: one upload going viral, or flopping, is not a
 * rate a buyer should be shown.
 */
export function engagementPercent(
  videos: { views: number; likes: number; comments: number }[],
): number | null {
  if (videos.length < 3) return null;
  const views = videos.reduce((sum, v) => sum + v.views, 0);
  if (views <= 0) return null;
  const actions = videos.reduce((sum, v) => sum + v.likes + v.comments, 0);
  return Math.min(100, round1((actions / views) * 100));
}

// ----------------------------------------------------------------- Telegram

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (whole, name: string) => {
      if (name[0] === "#") {
        const code =
          name[1] === "x" || name[1] === "X"
            ? Number.parseInt(name.slice(2), 16)
            : Number.parseInt(name.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
      }
      return ENTITIES[name.toLowerCase()] ?? whole;
    },
  );
}

/** `<meta property="og:title" content="…">`, in either attribute order. */
function metaContent(html: string, property: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = Object.fromEntries(
      [...tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map((m) => [
        m[1].toLowerCase(),
        m[2],
      ]),
    );
    if (attrs.property === property || attrs.name === property) {
      return decodeEntities(attrs.content ?? "");
    }
  }
  return null;
}

export type PublicTelegramChannel = {
  /** A person's own profile is not something this marketplace lists. */
  kind: "channel" | "group" | "person";
  title: string;
  description: string;
  avatarUrl: string | null;
  /** Exact on this page, unlike the rounded figure in the preview. */
  members: number | null;
};

/** A t.me/<name> page, read. Null when nobody has that name. */
export function parseTelegramPage(html: string): PublicTelegramChannel | null {
  const extra = html
    .match(/class="tgme_page_extra"[^>]*>([^<]*)</)?.[1]
    ?.trim();
  // Every real account prints something here; the "Contact @name" page an
  // unknown name produces does not.
  if (!extra) return null;

  const kind = /subscriber/i.test(extra)
    ? "channel"
    : /member/i.test(extra)
      ? "group"
      : "person";

  const image = metaContent(html, "og:image");
  return {
    kind,
    title: metaContent(html, "og:title") ?? "",
    description: metaContent(html, "og:description") ?? "",
    // Accounts with no picture are given Telegram's own logo.
    avatarUrl: image && !image.includes("telegram.org/img/") ? image : null,
    members: kind === "person" ? null : parseCount(extra),
  };
}

/** The view count under each post on the t.me/s/<name> preview. */
export function parseTelegramPostViews(html: string): number[] {
  return [...html.matchAll(/class="tgme_widget_message_views">([^<]+)</g)]
    .map((match) => parseCount(match[1]))
    .filter((views): views is number => views !== null);
}

/**
 * Average views per post as a share of members — the figure Telegram's ad
 * market quotes as engagement.
 *
 * Capped at 100: forwards carry a post past the channel's own members, and
 * the form refuses an engagement rate above 100%.
 */
export function postReachPercent(
  views: number[],
  members: number,
): number | null {
  if (members <= 0 || views.length < 3) return null;
  const average = views.reduce((sum, v) => sum + v, 0) / views.length;
  return Math.min(100, round1((average / members) * 100));
}
