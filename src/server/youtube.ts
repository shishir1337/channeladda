import "server-only";

import { containsOwnershipCode, type ParsedChannel } from "@/lib/channel-url";

/**
 * The YouTube Data API, for the two things a listing needs.
 *
 * **Filling a listing in.** A seller pastes their channel link and the name,
 * avatar and subscriber count come back from Google rather than from the
 * seller's memory. Those three numbers are what a buyer decides on, so a
 * typo in them is not cosmetic.
 *
 * **Proving they control it.** We issue a code, they put it in the channel
 * description, and this reads the description back. That is the whole
 * ownership check: anybody can type a link, only the owner can edit the
 * description behind it.
 *
 * Without a key, both degrade honestly: the seller fills the fields in by hand
 * and staff verify the code by looking. That is how the product worked before
 * this existed, so an absent key is a slower path and not a broken one.
 */
const API = "https://www.googleapis.com/youtube/v3";

export type ChannelFacts = {
  channelId: string;
  title: string;
  description: string;
  avatarUrl: string | null;
  subscribers: number;
  /** Null when the channel hides its subscriber count, which many do. */
  subscribersHidden: boolean;
  videos: number;
  views: number;
  country: string | null;
  publishedAt: Date | null;
  canonicalUrl: string;
};

export class YouTubeError extends Error {
  constructor(
    message: string,
    readonly kind: "not-configured" | "not-found" | "quota" | "failed",
  ) {
    super(message);
    this.name = "YouTubeError";
  }
}

export function isYouTubeConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY);
}

type ChannelItem = {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    customUrl?: string;
    country?: string;
    publishedAt?: string;
    thumbnails?: Record<string, { url?: string } | undefined>;
  };
  statistics?: {
    subscriberCount?: string;
    hiddenSubscriberCount?: boolean;
    videoCount?: string;
    viewCount?: string;
  };
};

async function query(
  params: Record<string, string | undefined>,
): Promise<ChannelItem[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new YouTubeError("YOUTUBE_API_KEY is not set.", "not-configured");
  }

  const url = new URL(`${API}/channels`);
  url.searchParams.set("part", "snippet,statistics");
  url.searchParams.set("key", key);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(name, value);
  }

  const response = await fetch(url, { cache: "no-store" });
  const text = await response.text();

  let body: { items?: ChannelItem[]; error?: { message?: string } };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    throw new YouTubeError(
      `YouTube returned ${response.status} with a non-JSON body.`,
      "failed",
    );
  }

  if (response.status === 403) {
    // Nearly always the daily quota. Worth saying so, because the fix is to
    // wait rather than to retry.
    throw new YouTubeError(
      body.error?.message ?? "YouTube refused the request.",
      "quota",
    );
  }
  if (!response.ok) {
    throw new YouTubeError(
      body.error?.message ?? `YouTube returned ${response.status}.`,
      "failed",
    );
  }

  return body.items ?? [];
}

function toFacts(item: ChannelItem): ChannelFacts {
  const thumbnails = item.snippet?.thumbnails ?? {};
  // Highest resolution first: a listing avatar is rendered at 2x on a retina
  // screen and the default is 88px.
  const avatarUrl =
    thumbnails.high?.url ??
    thumbnails.medium?.url ??
    thumbnails.default?.url ??
    null;

  const hidden = item.statistics?.hiddenSubscriberCount === true;
  const published = item.snippet?.publishedAt;

  return {
    channelId: item.id,
    title: item.snippet?.title ?? "",
    description: item.snippet?.description ?? "",
    avatarUrl,
    subscribers: hidden ? 0 : Number(item.statistics?.subscriberCount ?? 0),
    subscribersHidden: hidden,
    videos: Number(item.statistics?.videoCount ?? 0),
    views: Number(item.statistics?.viewCount ?? 0),
    country: item.snippet?.country ?? null,
    publishedAt: published ? new Date(published) : null,
    canonicalUrl: item.snippet?.customUrl
      ? `https://www.youtube.com/${item.snippet.customUrl}`
      : `https://www.youtube.com/channel/${item.id}`,
  };
}

/**
 * Look up a channel from whatever the seller pasted.
 *
 * `forHandle` and `id` are one quota unit each. A legacy /c/ or /user/ name
 * has no direct lookup, so it costs a search (100 units) — which is why the
 * seller is asked for the modern link when that happens rather than being
 * charged for it silently.
 */
export async function fetchChannel(
  parsed: ParsedChannel,
): Promise<ChannelFacts> {
  if (parsed.platform !== "YOUTUBE") {
    throw new YouTubeError(
      "Only YouTube channels can be filled in automatically.",
      "failed",
    );
  }

  const params =
    parsed.kind === "id"
      ? { id: parsed.value }
      : parsed.kind === "handle"
        ? { forHandle: parsed.value }
        : { forUsername: parsed.value };

  const items = await query(params);
  if (items.length === 0) {
    throw new YouTubeError(
      parsed.kind === "legacy"
        ? "We could not find that channel from an old-style link. Open the channel, copy the link from your browser's address bar, and paste that instead."
        : "No YouTube channel matched that link. Check it opens in a browser.",
      "not-found",
    );
  }

  return toFacts(items[0]);
}

/**
 * Whether the code we issued is in the channel's description right now.
 *
 * Read fresh every time, never cached: the seller can remove it the moment
 * after it is checked, and a stale yes is the one answer this must not give.
 */
export async function verifyOwnershipCode(
  channelId: string,
  code: string,
): Promise<{ ok: boolean; description: string }> {
  const items = await query({ id: channelId });
  if (items.length === 0) {
    throw new YouTubeError("That channel no longer exists.", "not-found");
  }

  const description = items[0].snippet?.description ?? "";
  return { ok: containsOwnershipCode(description, code), description };
}
