"use server";

import { revalidatePath } from "next/cache";
import {
  containsOwnershipCode,
  newOwnershipCode,
  parseChannelUrl,
} from "@/lib/channel-url";
import { db } from "@/lib/db";
import { recordAudit } from "@/server/audit";
import { requireUser } from "@/server/session";
import {
  fetchChannel,
  isYouTubeConfigured,
  verifyOwnershipCode,
  YouTubeError,
} from "@/server/youtube";

/**
 * Filling a listing in from a link, and proving the seller owns it.
 *
 * Both halves work without a YouTube API key, just more slowly: the seller
 * types the figures and staff read the channel description themselves. The
 * code is issued either way, because it is the ownership check and not a
 * convenience.
 */
export type LookupResult =
  | {
      ok: true;
      platform: string;
      channelId: string | null;
      title: string;
      description: string;
      avatarUrl: string | null;
      subscribers: number;
      subscribersHidden: boolean;
      ageYears: number;
      country: string | null;
      canonicalUrl: string;
      /** True when the figures came from the seller rather than from Google. */
      manual: boolean;
    }
  | { ok: false; error: string };

/**
 * Lookups per person, per hour.
 *
 * The YouTube quota is ten thousand units a day for the whole platform, and a
 * lookup costs one. Without a cap, one signed-in account in a loop disables
 * automated ownership verification for everybody until midnight — so this is
 * a shared resource being spent, not just a request being served.
 *
 * In memory, which means per instance and reset on deploy. That matches the
 * rate limiting in `src/lib/auth.ts` and is honest about what it is: a
 * backstop against a runaway client, not a security control.
 */
const LOOKUPS_PER_HOUR = 30;
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

  // Nothing but YouTube has a usable public API for this, and guessing at
  // somebody's follower count would be worse than asking.
  if (parsed.platform !== "YOUTUBE" || !isYouTubeConfigured()) {
    return {
      ok: true,
      platform: parsed.platform,
      channelId: parsed.kind === "id" ? parsed.value : null,
      title: "",
      description: "",
      avatarUrl: null,
      subscribers: 0,
      subscribersHidden: false,
      ageYears: 0,
      country: null,
      canonicalUrl: url.trim(),
      manual: true,
    };
  }

  try {
    const facts = await fetchChannel(parsed);
    const ageYears = facts.publishedAt
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - facts.publishedAt.getTime()) / 31_557_600_000,
          ),
        )
      : 0;

    return {
      ok: true,
      platform: "YOUTUBE",
      channelId: facts.channelId,
      title: facts.title,
      description: facts.description,
      avatarUrl: facts.avatarUrl,
      subscribers: facts.subscribers,
      subscribersHidden: facts.subscribersHidden,
      ageYears,
      country: facts.country,
      canonicalUrl: facts.canonicalUrl,
      manual: false,
    };
  } catch (error) {
    if (error instanceof YouTubeError) {
      return {
        ok: false,
        error:
          error.kind === "quota"
            ? "We have hit today's lookup limit with YouTube. Fill the figures in by hand — nothing is lost."
            : error.message,
      };
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

export async function checkOwnershipCode(
  listingId: string,
): Promise<VerifyResult> {
  const user = await requireUser();

  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      sellerId: true,
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
    await db.listing.update({
      where: { id: listing.id },
      data: { status: "CODE_CHECK" },
    });
    revalidatePath(`/dashboard/listings/${listing.id}`);
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
    if (!result.ok) {
      return {
        ok: false,
        error:
          "The code is not in your channel description yet. Save the change on YouTube, give it a minute, and check again.",
      };
    }

    await db.listing.update({
      where: { id: listing.id },
      data: {
        ownershipVerifiedAt: new Date(),
        status: "ADMIN_REVIEW",
        // Recorded now that it is proven, and overwritten from the verified
        // channel so the listing cannot advertise figures from another one.
        externalId: facts.channelId,
        title: facts.title || undefined,
        audience: facts.subscribersHidden ? undefined : facts.subscribers,
        avatarUrl: facts.avatarUrl ?? undefined,
      },
    });
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
  return containsOwnershipCode(description, code);
}
