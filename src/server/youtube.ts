import "server-only";

import {
  engagementPercent,
  fullBannerUrl,
  nicheFromTopics,
  PAGE_HEADERS,
  type PublicYouTubeChannel,
  parseYouTubeAboutPage,
} from "@/lib/channel-pages";
import { containsOwnershipCode, type ParsedChannel } from "@/lib/channel-url";
import { PageReadError, readPage } from "@/server/page-text";

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
  /** The whole banner at 1600×900, ready to be a listing cover. */
  bannerUrl: string | null;
  subscribers: number;
  /** Null when the channel hides its subscriber count, which many do. */
  subscribersHidden: boolean;
  videos: number;
  views: number;
  /** An ISO country code, e.g. "US". */
  country: string | null;
  publishedAt: Date | null;
  /** From Google's own topic tags, e.g. "Technology". */
  niche: string | null;
  /** The playlist of every upload, for reading recent videos' figures. */
  uploadsPlaylistId: string | null;
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
  brandingSettings?: { image?: { bannerExternalUrl?: string } };
  topicDetails?: { topicCategories?: string[] };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
};

/**
 * One call to the API.
 *
 * Every endpoint used here costs one unit, whichever parts are asked for, so
 * a channel lookup asks for all the parts the form can use in one go.
 */
async function call<T>(
  endpoint: "channels" | "playlistItems" | "videos",
  params: Record<string, string | undefined>,
): Promise<T[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new YouTubeError("YOUTUBE_API_KEY is not set.", "not-configured");
  }

  const url = new URL(`${API}/${endpoint}`);
  url.searchParams.set("key", key);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(name, value);
  }

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const text = await response.text();

  let body: { items?: T[]; error?: { message?: string } };
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

const query = (params: Record<string, string | undefined>) =>
  call<ChannelItem>("channels", {
    part: "snippet,statistics,brandingSettings,topicDetails,contentDetails",
    ...params,
  });

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

  const banner = item.brandingSettings?.image?.bannerExternalUrl;

  return {
    channelId: item.id,
    title: item.snippet?.title ?? "",
    description: item.snippet?.description ?? "",
    avatarUrl,
    bannerUrl: banner ? fullBannerUrl(banner) : null,
    subscribers: hidden ? 0 : Number(item.statistics?.subscriberCount ?? 0),
    subscribersHidden: hidden,
    videos: Number(item.statistics?.videoCount ?? 0),
    views: Number(item.statistics?.viewCount ?? 0),
    country: item.snippet?.country ?? null,
    publishedAt: published ? new Date(published) : null,
    niche: nicheFromTopics(item.topicDetails?.topicCategories ?? []),
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads ?? null,
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
 * Likes and comments over views, across the ten latest uploads.
 *
 * Two units: one for the playlist, one for the videos. Null on any failure —
 * this is an estimate offered to the seller, and a lookup that has already
 * found the channel must not fail over it.
 */
export async function recentEngagement(
  uploadsPlaylistId: string,
): Promise<number | null> {
  try {
    const items = await call<{ contentDetails?: { videoId?: string } }>(
      "playlistItems",
      {
        part: "contentDetails",
        playlistId: uploadsPlaylistId,
        maxResults: "10",
      },
    );
    const ids = items
      .map((item) => item.contentDetails?.videoId)
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) return null;

    const videos = await call<{
      statistics?: {
        viewCount?: string;
        likeCount?: string;
        commentCount?: string;
      };
    }>("videos", { part: "statistics", id: ids.join(",") });

    return engagementPercent(
      videos.map((video) => ({
        views: Number(video.statistics?.viewCount ?? 0),
        likes: Number(video.statistics?.likeCount ?? 0),
        comments: Number(video.statistics?.commentCount ?? 0),
      })),
    );
  } catch {
    return null;
  }
}

/**
 * The channel's public /about page, read — for when there is no API key, or
 * the day's shared quota has gone.
 *
 * The address is built here from what `parseChannelUrl` extracted, never
 * taken from the seller, so this only ever connects to www.youtube.com. It
 * also reads old /c/ and /user/ links, which the API can only resolve with a
 * hundred-unit search.
 */
export async function fetchChannelPage(
  parsed: ParsedChannel,
): Promise<PublicYouTubeChannel> {
  if (parsed.platform !== "YOUTUBE" || parsed.kind === "domain") {
    throw new YouTubeError("That is not a YouTube channel.", "failed");
  }

  // The value came out of a URL, so it may already be percent-encoded;
  // decoding first means it is encoded exactly once.
  let raw = parsed.value;
  try {
    raw = decodeURIComponent(parsed.value);
  } catch {
    // Not valid percent-encoding: encode it as it stands.
  }
  const value = encodeURIComponent(raw);
  // An old name may live under /c/ or /user/ and parses the same either way;
  // only one of the two answers for a given channel.
  const paths =
    parsed.kind === "id"
      ? [`channel/${value}`]
      : parsed.kind === "handle"
        ? [`@${value}`]
        : [`c/${value}`, `user/${value}`];

  let status = 404;
  let html = "";
  for (const path of paths) {
    // One deadline for the answer and the page together: the page is about
    // 3MB, and a timeout while its body is still arriving is as much "did
    // not answer in time" as one before the headers.
    try {
      ({ status, text: html } = await readPage(
        `https://www.youtube.com/${path}/about`,
        {
          headers: PAGE_HEADERS,
          timeoutMs: 10_000,
          maxBytes: 8 * 1024 * 1024,
          // An old /c/ link redirects to the channel's current address.
          allowHosts: /^(www\.|m\.)?youtube\.com$/,
        },
      ));
    } catch (error) {
      throw new YouTubeError(
        error instanceof PageReadError && error.kind === "timeout"
          ? "YouTube did not answer in time. Try again, or fill it in by hand."
          : "We could not reach YouTube. Try again, or fill it in by hand.",
        "failed",
      );
    }
    if (status !== 404) break;
  }

  if (status === 404) {
    throw new YouTubeError(
      "No YouTube channel matched that link. Check it opens in a browser.",
      "not-found",
    );
  }
  if (status < 200 || status >= 300) {
    throw new YouTubeError(`YouTube returned ${status}.`, "failed");
  }
  const facts = parseYouTubeAboutPage(html);
  if (!facts) {
    throw new YouTubeError(
      "We could not read that channel's page. Fill the figures in by hand — nothing is lost.",
      "failed",
    );
  }
  return facts;
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
