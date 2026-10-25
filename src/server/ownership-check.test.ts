import { beforeEach, expect, test, vi } from "vitest";
import type { ListingStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { seedListing, withCleanDb } from "@/test/db";

// The signed-in seller and the YouTube answer are the two things replaced.
// The action, its status rules and the database are real.
const viewer = vi.hoisted(() => ({ id: "" }));
const youtube = vi.hoisted(() => ({ configured: false, codeFound: true }));

vi.mock("@/server/session", () => ({
  requireUser: async () => ({
    id: viewer.id,
    role: "USER",
    emailVerified: true,
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/youtube", async (original) => ({
  ...(await original<typeof import("@/server/youtube")>()),
  isYouTubeConfigured: () => youtube.configured,
  fetchChannel: async () => ({
    channelId: "UC_verified",
    canonicalUrl: "https://www.youtube.com/@verified",
    title: "Verified channel",
    subscribers: 120_000,
    subscribersHidden: false,
    avatarUrl: null,
  }),
  verifyOwnershipCode: async () => ({ ok: youtube.codeFound }),
}));

const { checkOwnershipCode } = await import("@/server/actions/channel-lookup");

beforeEach(() => {
  youtube.configured = false;
  youtube.codeFound = true;
});

async function listingIn(status: ListingStatus) {
  const seeded = await seedListing();
  await db.listing.update({
    where: { id: seeded.listing.id },
    data: {
      status,
      ownershipCode: "CA-ABCD-EFGH",
      ownershipVerifiedAt: null,
      sourceUrl: "https://www.youtube.com/@test-channel",
    },
  });
  viewer.id = seeded.seller.id;
  return seeded.listing.id;
}

async function statusOf(id: string) {
  return (await db.listing.findUniqueOrThrow({ where: { id } })).status;
}

test(
  "a taken-down listing cannot be put back into review by checking its code",
  withCleanDb(async () => {
    // Undoing a takedown is a moderator's decision (reopenListing). The check
    // set CODE_CHECK — or, verified automatically, ADMIN_REVIEW — from any
    // status, so the seller could walk straight around it.
    for (const configured of [false, true]) {
      youtube.configured = configured;
      const id = await listingIn("REMOVED");

      const result = await checkOwnershipCode(id);

      expect(result.ok).toBe(false);
      expect(await statusOf(id)).toBe("REMOVED");
    }
  }),
);

test(
  "a draft cannot skip to review by checking its code",
  withCleanDb(async () => {
    // A draft reaches review through startOwnershipCheck and, without the
    // automatic check, submitForReview — which requires a proof screenshot.
    const id = await listingIn("DRAFT");
    youtube.configured = true;

    await checkOwnershipCode(id);

    expect(await statusOf(id)).toBe("DRAFT");
    const row = await db.listing.findUniqueOrThrow({ where: { id } });
    expect(row.ownershipVerifiedAt).toBeNull();
  }),
);

test(
  "a rejected listing cannot skip its fix by checking its code",
  withCleanDb(async () => {
    const id = await listingIn("REJECTED");
    youtube.configured = true;

    await checkOwnershipCode(id);

    expect(await statusOf(id)).toBe("REJECTED");
  }),
);

test(
  "a channel whose code is found goes live at once, with no moderator in between",
  withCleanDb(async () => {
    // The owner: "for a channel's listing we need to approve from the admin
    // team — no need, make it automatic." Google has just proved the seller
    // controls the channel; a moderator pressing Approve added nothing.
    youtube.configured = true;
    const id = await listingIn("CODE_CHECK");
    const before = Date.now();

    expect(await checkOwnershipCode(id)).toMatchObject({ ok: true });

    const row = await db.listing.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("LIVE");
    expect(row.ownershipVerifiedAt).not.toBeNull();
    // The age buyers see starts now, not when the draft was opened.
    expect(row.listedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    const told = await db.notification.findFirst({
      where: { userId: viewer.id, kind: "LISTING" },
    });
    // Saying which listing: a seller with several could not tell.
    expect(told?.title).toBe(`Your listing is live: ${row.title}`);
  }),
);

test(
  "a first-time seller gets a public profile address as their channel goes live",
  withCleanDb(async () => {
    // Without one, the live listing would be a 404: its page links to the
    // seller's profile.
    youtube.configured = true;
    const id = await listingIn("CODE_CHECK");
    await db.user.update({ where: { id: viewer.id }, data: { slug: null } });

    await checkOwnershipCode(id);

    expect(await statusOf(id)).toBe("LIVE");
    const seller = await db.user.findUniqueOrThrow({
      where: { id: viewer.id },
    });
    expect(seller.slug).toBeTruthy();
  }),
);

test(
  "a listing already sent for review goes live once its code is found",
  withCleanDb(async () => {
    youtube.configured = true;
    const id = await listingIn("ADMIN_REVIEW");

    expect(await checkOwnershipCode(id)).toMatchObject({ ok: true });

    const row = await db.listing.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("LIVE");
    expect(row.ownershipVerifiedAt).not.toBeNull();
  }),
);

test(
  "without the automatic check, a listing waiting on its code keeps waiting",
  withCleanDb(async () => {
    const id = await listingIn("CODE_CHECK");

    const result = await checkOwnershipCode(id);

    expect(result).toMatchObject({ ok: false, manual: true });
    expect(await statusOf(id)).toBe("CODE_CHECK");
  }),
);
