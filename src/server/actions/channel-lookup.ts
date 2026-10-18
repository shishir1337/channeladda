"use server";

import { revalidatePath } from "next/cache";
import type { ListingStatus } from "@/generated/prisma/enums";
import { countryName, wholeYearsSince } from "@/lib/channel-pages";
import {
  containsOwnershipCode,
  handleFromUrl,
  newOwnershipCode,
  normaliseChannelUrl,
  type ParsedChannel,
  parseChannelUrl,
  suggestHandle,
} from "@/lib/channel-url";
import { db } from "@/lib/db";
import { recordAudit } from "@/server/audit";
import { storeRemoteImage } from "@/server/remote-image";
import { requireUser } from "@/server/session";
import { fetchTelegramChannel, TelegramError } from "@/server/telegram";
import {
  fetchChannel,
  fetchChannelPage,
  isYouTubeConfigured,
  recentEngagement,
  verifyOwnershipCode,
  YouTubeError,
} from "@/server/youtube";

/**
 * Filling a listing in from a link, and proving the seller owns it.
 *
 * Both halves work without a YouTube API key. Filling in reads the channel's
 * public page instead (and Telegram's, which has no API at all); the
 * ownership check falls back to staff reading the description themselves.
 * The code is issued either way, because it is the ownership check and not a
 * convenience.
 */
export type LookupResult =
  | {
      ok: true;
      platform: string;
      channelId: string | null;
      /** The @name, when the link or Google gave us one. */
      handle: string | null;
      title: string;
      description: string;
      /** Our own copy of the channel's picture, already uploaded. */
      avatarUrl: string | null;
      /** Our own copy of the channel's banner, as a listing cover. */
      coverUrl: string | null;
      subscribers: number;
      subscribersHidden: boolean;
      /** Shown to help the seller recognise the channel; not saved. */
      videos: number | null;
      views: number | null;
      ageYears: number;
      country: string | null;
      niche: string | null;
      /** An estimate, with what it was worked out from beside it. */
      engagement: number | null;
      engagementBasis: string | null;
      canonicalUrl: string;
      /** True when the figures came from the seller rather than from Google. */
      manual: boolean;
      /** Where the figures came from, when they did not come from the seller. */
      source: "api" | "page" | null;
    }
  | { ok: false; error: string };

type Found = Omit<
  Extract<LookupResult, { ok: true }>,
  "ok" | "avatarUrl" | "coverUrl"
> & {
  /** The platform's own copies, before they are stored as ours. */
  avatarFrom: string | null;
  coverFrom: string | null;
};

/**
 * From Google's API. Null when the API cannot answer for a reason the
 * channel's own page might get around — no key, the quota, a legacy link,
 * a hiccup — so the caller tries the page next.
 */
async function youtubeFromApi(
  parsed: ParsedChannel,
  url: string,
): Promise<Found | null> {
  if (!isYouTubeConfigured()) return null;
  try {
    const facts = await fetchChannel(parsed);
    const engagement = facts.uploadsPlaylistId
      ? await recentEngagement(facts.uploadsPlaylistId)
      : null;
    return {
      platform: "YOUTUBE",
      channelId: facts.channelId,
      // From the canonical URL Google returns, not only from the link the
      // seller pasted: a /channel/UC… link has no handle in it, but the
      // channel may still have one.
      handle: suggestHandle(facts.canonicalUrl) ?? suggestHandle(url),
      title: facts.title,
      description: facts.description,
      avatarFrom: facts.avatarUrl,
      coverFrom: facts.bannerUrl,
      subscribers: facts.subscribers,
      subscribersHidden: facts.subscribersHidden,
      videos: facts.videos,
      views: facts.views,
      ageYears: facts.publishedAt ? wholeYearsSince(facts.publishedAt) : 0,
      country: facts.country ? countryName(facts.country) : null,
      niche: facts.niche,
      engagement,
      engagementBasis:
        engagement === null ? null : "likes and comments on the last 10 videos",
      canonicalUrl: facts.canonicalUrl,
      manual: false,
      source: "api",
    };
  } catch (error) {
    // A channel that does not exist does not exist on its page either —
    // except an old /c/ name, which only the page can resolve.
    if (
      error instanceof YouTubeError &&
      error.kind === "not-found" &&
      parsed.kind !== "legacy"
    ) {
      throw error;
    }
    if (!(error instanceof YouTubeError)) {
      console.error("[channel-lookup] api", error);
    }
    return null;
  }
}

async function youtubeFromPage(parsed: ParsedChannel): Promise<Found> {
  const page = await fetchChannelPage(parsed);
  return {
    platform: "YOUTUBE",
    channelId: page.channelId,
    // Read off the page decoded, so it can be one the listing rule refuses.
    handle:
      page.handle && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(page.handle)
        ? page.handle
        : null,
    title: page.title,
    description: page.description,
    avatarFrom: page.avatarUrl,
    coverFrom: page.bannerUrl,
    subscribers: page.subscribers ?? 0,
    subscribersHidden: page.subscribers === null,
    videos: page.videos,
    views: page.views,
    ageYears: page.joinedAt ? wholeYearsSince(page.joinedAt) : 0,
    country: page.country,
    niche: null,
    engagement: null,
    engagementBasis: null,
    canonicalUrl: page.handle
      ? `https://www.youtube.com/@${encodeURIComponent(page.handle)}`
      : `https://www.youtube.com/channel/${page.channelId}`,
    manual: false,
    source: "page",
  };
}

async function telegramFromPage(name: string): Promise<Found> {
  const { channel, reach } = await fetchTelegramChannel(name);
  return {
    platform: "TELEGRAM",
    channelId: null,
    handle: name,
    title: channel.title,
    description: channel.description,
    avatarFrom: channel.avatarUrl,
    // Telegram channels have no banner.
    coverFrom: null,
    subscribers: channel.members ?? 0,
    subscribersHidden: channel.members === null,
    videos: null,
    views: null,
    ageYears: 0,
    country: null,
    niche: null,
    engagement: reach,
    engagementBasis:
      reach === null ? null : "average views on the latest posts",
    canonicalUrl: `https://t.me/${name}`,
    manual: false,
    source: "page",
  };
}

/**
 * Lookups per person, per hour.
 *
 * The YouTube quota is ten thousand units a day for the whole platform, and a
 * lookup with a key costs up to three: the channel, its latest uploads, and
 * their figures. Twelve an hour is far more than a seller listing a channel
 * needs, and keeps one account from spending more than a few percent of the
 * day. Without a cap, one signed-in account in a loop disables
 * automated ownership verification for everybody until midnight — so this is
 * a shared resource being spent, not just a request being served.
 *
 * In memory, which means per instance and reset on deploy. That matches the
 * rate limiting in `src/lib/auth.ts` and is honest about what it is: a
 * backstop against a runaway client, not a security control.
 */
const LOOKUPS_PER_HOUR = 12;
const lookupCounts = new Map<string, { count: number; resetAt: number }>();

function withinLookupBudget(userId: string): boolean {
  const now = Date.now();
  const existing = lookupCounts.get(userId);

  if (!existing || existing.resetAt < now) {
    lookupCounts.set(userId, { count: 1, resetAt: now + 3_600_000 });
    return true;
  }
  if (existing.count >= LOOKUPS_PER_HOUR) return false;

  existing.count += 1;
  return true;
}

export async function lookupChannel(url: string): Promise<LookupResult> {
  const user = await requireUser();

  if (!withinLookupBudget(user.id)) {
    return {
      ok: false,
      error:
        "That is a lot of lookups in an hour. Fill the figures in by hand for now — nothing is lost, and the limit resets shortly.",
    };
  }

  const parsed = parseChannelUrl(url);
  if (!parsed) {
    return {
      ok: false,
      error:
        "That does not look like a channel link. Open the account, copy the link from your browser's address bar, and paste it here.",
    };
  }

  // YouTube and Telegram show their figures to anyone; Instagram, Facebook
  // and websites do not, and guessing at somebody's follower count would be
  // worse than asking.
  if (parsed.platform !== "YOUTUBE" && parsed.platform !== "TELEGRAM") {
    return {
      ok: true,
      platform: parsed.platform,
      channelId: parsed.kind === "id" ? parsed.value : null,
      handle: suggestHandle(url),
      title: "",
      description: "",
      avatarUrl: null,
      coverUrl: null,
      subscribers: 0,
      subscribersHidden: false,
      videos: null,
      views: null,
      ageYears: 0,
      country: null,
      niche: null,
      engagement: null,
      engagementBasis: null,
      // Normalised, not echoed. The listing schema refuses a link with no
      // scheme, and that error had no rendered home.
      canonicalUrl: normaliseChannelUrl(url) ?? url.trim(),
      manual: true,
      source: null,
    };
  }

  try {
    const found =
      parsed.platform === "TELEGRAM"
        ? await telegramFromPage(parsed.value)
        : ((await youtubeFromApi(parsed, url)) ??
          (await youtubeFromPage(parsed)));

    const { avatarFrom, coverFrom, ...facts } = found;
    const [avatarUrl, coverUrl] = await Promise.all([
      storeRemoteImage(avatarFrom, "avatar", user.id),
      storeRemoteImage(coverFrom, "cover", user.id),
    ]);

    return { ok: true, ...facts, avatarUrl, coverUrl };
  } catch (error) {
    if (error instanceof YouTubeError || error instanceof TelegramError) {
      return { ok: false, error: error.message };
    }
    console.error("[channel-lookup]", error);
    return {
      ok: false,
      error: "That lookup did not finish. Try again, or fill it in by hand.",
    };
  }
}

export type CodeResult =
  | { ok: true; code: string; message: string }
  | { ok: false; error: string };

/**
 * Issue the code the seller puts in their channel description.
 *
 * Re-issued rather than regenerated on a second call: a seller who has already
 * pasted the code somewhere must not be handed a different one and quietly
 * fail verification for ever.
 */
export async function issueOwnershipCode(
  listingId: string,
): Promise<CodeResult> {
  const user = await requireUser();

  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { id: true, sellerId: true, ownershipCode: true, slug: true },
  });
  if (!listing || listing.sellerId !== user.id) {
    return { ok: false, error: "That listing is not yours." };
  }

  const code = listing.ownershipCode ?? newOwnershipCode();
  if (!listing.ownershipCode) {
    await db.listing.update({
      where: { id: listing.id },
      data: { ownershipCode: code },
    });
  }

  return {
    ok: true,
    code,
    message:
      "Put this anywhere in your channel description, save it, then come back and check. You can take it out once we have verified.",
  };
}

export type VerifyResult =
  | { ok: true; message: string }
  | { ok: false; error: string; manual?: boolean };

/**
 * The statuses a code check can act on.
 *
 * Waiting on the code, or already with a moderator. Anything else reaches
 * review another way — a draft or a rejected listing through
 * startOwnershipCheck, a taken-down one only through a moderator reopening
 * it — and the check used to move a listing from any status, so it walked
 * around every one of those.
 */
const CHECKABLE: readonly ListingStatus[] = ["CODE_CHECK", "ADMIN_REVIEW"];

export async function checkOwnershipCode(
  listingId: string,
): Promise<VerifyResult> {
  const user = await requireUser();

  // A passing check sends the listing to a moderator, which is selling.
  if (!user.emailVerified) {
    return {
      ok: false,
      error: "Confirm your email address before sending a listing for review.",
    };
  }

  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      sellerId: true,
      status: true,
      slug: true,
      platform: true,
      ownershipCode: true,
      sourceUrl: true,
      ownershipVerifiedAt: true,
    },
  });
  if (!listing || listing.sellerId !== user.id) {
    return { ok: false, error: "That listing is not yours." };
  }
  if (listing.ownershipVerifiedAt) {
    return { ok: true, message: "Already verified." };
  }
  if (!listing.ownershipCode) {
    return { ok: false, error: "Get a code first." };
  }
  if (!CHECKABLE.includes(listing.status)) {
    return {
      ok: false,
      error:
        listing.status === "REMOVED"
          ? "This listing was taken down by a moderator. If you think that was a mistake, contact support."
          : "This listing is not waiting on an ownership check. Send it for review from the listing page first.",
    };
  }

  // The channel is resolved from the link on the listing, every time, and
  // never from a stored id. It used to be checked against `externalId`, which
  // the seller could set to anything through the form — so listing one channel
  // and pointing the check at another they did control earned a public
  // verified badge on an account they had nothing to do with.
  const parsed = listing.sourceUrl ? parseChannelUrl(listing.sourceUrl) : null;

  // No API key, no usable link, or not a YouTube channel: a human reads the
  // description. The listing still cannot go live unverified, it just waits.
  if (
    listing.platform !== "YOUTUBE" ||
    !parsed ||
    parsed.platform !== "YOUTUBE" ||
    !isYouTubeConfigured()
  ) {
    // Nothing to write: the listing is already waiting on the code, or
    // already with a moderator. This used to set CODE_CHECK, which knocked
    // a listing in review back a step.
    return {
      ok: false,
      manual: true,
      error:
        "We cannot check this one automatically. Leave the code in place — a moderator will look, usually within a few hours.",
    };
  }

  try {
    // Fetched fresh from the link, so the id the code is checked against is
    // the id of the channel the listing actually advertises.
    const facts = await fetchChannel(parsed);
    const result = await verifyOwnershipCode(
      facts.channelId,
      listing.ownershipCode,
    );

    // What the verified channel is actually called. Taken from the
    // canonical URL Google returns rather than from anything the seller
    // typed.
    const verifiedHandle = handleFromUrl(facts.canonicalUrl);
    if (!result.ok) {
      return {
        ok: false,
        error:
          "The code is not in your channel description yet. Save the change on YouTube, give it a minute, and check again.",
      };
    }

    // Compare-and-set on the status checked above, so a listing withdrawn
    // or taken down while YouTube was answering stays where it went.
    const { count } = await db.listing.updateMany({
      where: { id: listing.id, status: listing.status },
      data: {
        ownershipVerifiedAt: new Date(),
        status: "ADMIN_REVIEW",
        // Recorded now that it is proven, and overwritten from the verified
        // channel so the listing cannot advertise figures from another one.
        externalId: facts.channelId,
        // The handle above all. It is the <h1> on the listing page with the
        // verified tick beside it, and it was the one field verification
        // never touched — so a seller could type @MrBeast, point sourceUrl
        // at a throwaway channel they really do control, put the code in
        // that one, and publish “@MrBeast ✓ Ownership verified”.
        handle: verifiedHandle ?? undefined,
        title: facts.title || undefined,
        audience: facts.subscribersHidden ? undefined : facts.subscribers,
        avatarUrl: facts.avatarUrl ?? undefined,
      },
    });
    if (count === 0) {
      return {
        ok: false,
        error:
          "This listing changed while we were checking it. Reload the page and try again.",
      };
    }
    await recordAudit({
      actorId: user.id,
      action: "listing.ownership_verified",
      entity: "listing",
      entityId: listing.id,
      after: {
        channelId: facts.channelId,
        resolvedFrom: listing.sourceUrl,
        automatic: true,
      },
    });

    revalidatePath(`/dashboard/listings/${listing.id}`);
    return {
      ok: true,
      message:
        "Verified — you control this channel. It is with a moderator now, and you can take the code out of your description.",
    };
  } catch (error) {
    if (error instanceof YouTubeError && error.kind === "quota") {
      return {
        ok: false,
        manual: true,
        error:
          "We have hit today's lookup limit with YouTube. Leave the code in place and a moderator will check it by hand.",
      };
    }
    console.error("[ownership-check]", error);
    return {
      ok: false,
      error: "That check did not finish. Try again in a moment.",
    };
  }
}

/** Used by the moderator queue when the API could not answer. */
export async function describesOwnership(
  description: string,
  code: string,
): Promise<boolean> {
  // A pure predicate over two strings the caller already has, so it leaks
  // nothing today — but it is the one action in the codebase with no
  // caller check, and the next edit that gives it a database read would
  // inherit that.
  await requireUser();
  return containsOwnershipCode(description, code);
}
