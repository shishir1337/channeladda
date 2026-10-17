import { beforeEach, expect, test, vi } from "vitest";
import type { ListingStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { seedListing, withCleanDb } from "@/test/db";

// The signed-in seller and the YouTube answer are the two things replaced.
// The action, its status rules and the database are real.
const viewer = vi.hoisted(() => ({ id: "" }));
const youtube = vi.hoisted(() => ({ configured: false, codeFound: true }));

vi.mock("@/server/session", () => ({
  requireUser: async () => ({ id: viewer.id, role: "USER" }),
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
  "a listing waiting on its code goes to review once the code is found",
  withCleanDb(async () => {
    youtube.configured = true;
    const id = await listingIn("CODE_CHECK");

    expect(await checkOwnershipCode(id)).toMatchObject({ ok: true });

    const row = await db.listing.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("ADMIN_REVIEW");
    expect(row.ownershipVerifiedAt).not.toBeNull();
  }),
);

test(
  "a listing already in review is verified and stays in review",
  withCleanDb(async () => {
    youtube.configured = true;
    const id = await listingIn("ADMIN_REVIEW");

    expect(await checkOwnershipCode(id)).toMatchObject({ ok: true });

    const row = await db.listing.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("ADMIN_REVIEW");
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
