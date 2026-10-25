import { expect, test } from "vitest";
import { db } from "@/lib/db";
import type { ListingLiveEdit } from "@/lib/listing-form";
import { SELLER_REMOVED_REASON } from "@/lib/listing-lock";
import { emptyFilters } from "@/lib/listing-query";
import { createDeal } from "@/server/deals";
import { getListing, queryListings } from "@/server/listings";
import { createOffer } from "@/server/offers";
import {
  clearVerificationIfIdentityChanged,
  getListingLocks,
  lockedListingIds,
  removeMyListing,
  updateLiveListing,
} from "@/server/seller-listings";
import { seedListing, withCleanDb } from "@/test/db";

/**
 * A seller editing and removing a listing after it has gone live (the owner,
 * 2026-10-26). Until now a listing could only be changed or deleted while it
 * was a draft or sent back; once live it could only be paused.
 */

/** The live edit form's input for the seeded listing, as it stands. */
function asSeeded(overrides: Partial<ListingLiveEdit> = {}): ListingLiveEdit {
  return {
    title: "Test channel",
    niche: "Tech",
    country: "Global",
    audience: 120_000,
    monetized: true,
    monthlyRevenue: 900,
    yearlyRevenue: 0,
    engagement: 7.4,
    ageYears: 3,
    price: 100,
    coverUrl: "/uploads/test-cover.png",
    avatarUrl: "/uploads/test-avatar.png",
    transferProfile: "",
    description: "",
    whatsapp: "",
    ...overrides,
  };
}

async function lastLine(conversationId: string) {
  return db.message.findFirstOrThrow({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    select: { body: true, kind: true },
  });
}

// ------------------------------------------------------------------ edit

test(
  "a live listing's price and title change at once, and the trail keeps both versions",
  withCleanDb(async () => {
    const { listing, seller, buyer } = await seedListing(); // $100
    // A deal opened before the edit keeps the price it opened at.
    const deal = await createDeal({
      listingId: listing.id,
      buyerId: buyer.id,
      mode: "FASTEST",
    });
    if (!deal.ok) throw new Error(deal.reason);

    const result = await updateLiveListing(
      seller.id,
      listing.id,
      asSeeded({ price: 80, title: "Monetized tech channel, three years old" }),
    );
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.changed.sort()).toEqual(["priceUsd", "title"]);

    const after = await db.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(after.priceUsd).toBe(8_000);
    expect(after.title).toBe("Monetized tech channel, three years old");
    // Still on sale, still the same account, no second review.
    expect(after.status).toBe("LIVE");
    expect(after.handle).toBe("@test-channel");

    const order = await db.order.findUniqueOrThrow({
      where: { id: deal.orderId },
    });
    expect(order.priceUsd).toBe(10_000);

    const trail = await db.auditLog.findMany({
      where: {
        entity: "listing",
        entityId: listing.id,
        action: "listing.edit",
      },
    });
    expect(trail).toHaveLength(1);
    expect(trail[0].actorId).toBe(seller.id);
    expect(trail[0].before).toEqual({
      priceUsd: 10_000,
      title: "Test channel",
    });
    expect(trail[0].after).toEqual({
      priceUsd: 8_000,
      title: "Monetized tech channel, three years old",
    });
  }),
);

test(
  "a save that changes nothing writes nothing to the trail",
  withCleanDb(async () => {
    const { listing, seller } = await seedListing();
    const result = await updateLiveListing(seller.id, listing.id, asSeeded());
    expect(result).toMatchObject({ ok: true, changed: [] });
    expect(await db.auditLog.count({ where: { action: "listing.edit" } })).toBe(
      0,
    );
  }),
);

test(
  "a paused listing can be edited too",
  withCleanDb(async () => {
    const { listing, seller } = await seedListing({ listingStatus: "PAUSED" });
    const result = await updateLiveListing(
      seller.id,
      listing.id,
      asSeeded({ niche: "Gadgets" }),
    );
    expect(result).toMatchObject({ ok: true });
    const after = await db.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(after.niche).toBe("Gadgets");
    expect(after.status).toBe("PAUSED");
  }),
);

test(
  "which account a live listing is cannot change",
  withCleanDb(async () => {
    const { listing, seller } = await seedListing();
    await db.listing.update({
      where: { id: listing.id },
      data: { sourceUrl: "https://www.youtube.com/@test-channel" },
    });

    for (const change of [
      { handle: "@somebody-else" },
      { platform: "instagram" as const },
      { sourceUrl: "https://www.youtube.com/@somebody-else" },
    ]) {
      expect(
        await updateLiveListing(
          seller.id,
          listing.id,
          asSeeded({ ...change, price: 50 }),
        ),
      ).toEqual({ ok: false, reason: "identity" });
    }

    // The same identity, spelt the way a form might send it back, is fine.
    expect(
      await updateLiveListing(
        seller.id,
        listing.id,
        asSeeded({
          handle: "test-channel",
          platform: "youtube",
          sourceUrl: "https://www.youtube.com/@test-channel/",
        }),
      ),
    ).toMatchObject({ ok: true });

    const after = await db.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(after.priceUsd).toBe(10_000);
    expect(after.handle).toBe("@test-channel");
    expect(after.platform).toBe("YOUTUBE");
  }),
);

test(
  "the subscriber count YouTube supplied at verification cannot be edited",
  withCleanDb(async () => {
    const { listing, seller } = await seedListing();
    await db.listing.update({
      where: { id: listing.id },
      data: { externalId: "UC-test", ownershipVerifiedAt: new Date() },
    });
    expect(
      await updateLiveListing(
        seller.id,
        listing.id,
        asSeeded({ audience: 2_000_000 }),
      ),
    ).toEqual({ ok: false, reason: "verified-audience" });
    // Everything else on it still can be.
    expect(
      await updateLiveListing(seller.id, listing.id, asSeeded({ price: 90 })),
    ).toMatchObject({ ok: true });
  }),
);

test(
  "a reserved listing, or one a paid deal holds, cannot be edited",
  withCleanDb(async () => {
    const reserved = await seedListing({ listingStatus: "RESERVED" });
    expect(
      await updateLiveListing(
        reserved.seller.id,
        reserved.listing.id,
        asSeeded({ price: 50 }),
      ),
    ).toEqual({ ok: false, reason: "reserved" });

    // A suspension pauses a reserved listing and its paid deal goes on.
    const paused = await seedListing();
    const deal = await createDeal({
      listingId: paused.listing.id,
      buyerId: paused.buyer.id,
      mode: "FASTEST",
    });
    if (!deal.ok) throw new Error(deal.reason);
    await db.order.update({
      where: { id: deal.orderId },
      data: { paymentRef: "test-paid", status: "AGENT_VERIFYING" },
    });
    await db.listing.update({
      where: { id: paused.listing.id },
      data: { status: "PAUSED" },
    });
    expect(
      await updateLiveListing(
        paused.seller.id,
        paused.listing.id,
        asSeeded({ price: 50 }),
      ),
    ).toEqual({ ok: false, reason: "in-deal" });

    const locks = await getListingLocks(paused.seller.id, paused.listing.id);
    expect(locks).toMatchObject({
      lock: "in-deal",
      canEdit: false,
      canRemove: false,
    });
    // The list page reads the same lock for every row in one query.
    expect([...(await lockedListingIds(paused.seller.id))]).toEqual([
      paused.listing.id,
    ]);

    const row = await db.listing.findUniqueOrThrow({
      where: { id: paused.listing.id },
    });
    expect(row.priceUsd).toBe(10_000);
  }),
);

test(
  "nobody edits a listing that is not theirs",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    expect(
      await updateLiveListing(buyer.id, listing.id, asSeeded({ price: 1 })),
    ).toEqual({ ok: false, reason: "not-found" });
  }),
);

test(
  "a replayed draft save cannot strip the badge off a live listing",
  withCleanDb(async () => {
    // The draft save clears verification before `updateDraft` refuses a
    // live listing, so it used to drop the badge for an edit that never
    // happened.
    const { listing, seller } = await seedListing();
    await db.listing.update({
      where: { id: listing.id },
      data: {
        sourceUrl: "https://youtube.com/@original",
        externalId: "UC-original",
        ownershipVerifiedAt: new Date(),
      },
    });
    expect(
      await clearVerificationIfIdentityChanged(seller.id, listing.id, {
        sourceUrl: "https://youtube.com/@somebody-else",
        handle: "@somebody-else",
      }),
    ).toBe(false);
    const after = await db.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(after.ownershipVerifiedAt).not.toBeNull();
    expect(after.externalId).toBe("UC-original");
  }),
);

// ---------------------------------------------------------------- remove

test(
  "removing a live listing closes its unpaid deal and declines its open offer, and tells both buyers",
  withCleanDb(async () => {
    const { listing, seller, buyer } = await seedListing();
    const other = await db.user.create({
      data: { email: "offer-buyer@example.test", name: "Offer Buyer" },
    });

    const deal = await createDeal({
      listingId: listing.id,
      buyerId: buyer.id,
      mode: "FASTEST",
    });
    if (!deal.ok) throw new Error(deal.reason);
    const offer = await createOffer({
      buyerId: other.id,
      listingId: listing.id,
      amountCents: 8_000,
      message: null,
      expiryHours: 48,
    });
    if (!offer.ok) throw new Error(offer.reason);

    const locks = await getListingLocks(seller.id, listing.id);
    expect(locks).toMatchObject({
      lock: null,
      canRemove: true,
      deletes: false,
      openOffers: 1,
      unpaidDeals: 1,
    });

    expect(await removeMyListing(seller.id, listing.id)).toMatchObject({
      ok: true,
      outcome: "removed",
    });

    const after = await db.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(after.status).toBe("REMOVED");
    expect(after.rejectionReason).toBe(SELLER_REMOVED_REASON);

    // The unpaid deal: closed, a line in its chat, the buyer told.
    const order = await db.order.findUniqueOrThrow({
      where: { id: deal.orderId },
    });
    expect(order.status).toBe("CANCELLED");
    expect(order.cancelledAt).not.toBeNull();
    expect((await lastLine(deal.conversationId)).body).toMatch(
      /took this listing off the marketplace/,
    );
    expect(
      await db.notification.findFirst({
        where: { userId: buyer.id, kind: "ORDER" },
        select: { title: true, href: true },
      }),
    ).toEqual({
      title: "The seller removed this listing",
      href: `/dashboard/deals/${deal.orderId}`,
    });

    // The open offer: declined, a line in its thread, the buyer told.
    const closedOffer = await db.offer.findUniqueOrThrow({
      where: { id: offer.value.offerId },
    });
    expect(closedOffer.status).toBe("REJECTED");
    expect((await lastLine(offer.value.conversationId)).body).toMatch(
      /seller took the listing off the marketplace/,
    );
    const offerNote = await db.notification.findFirstOrThrow({
      where: { userId: other.id, kind: "OFFER", title: { contains: "closed" } },
    });
    expect(offerNote.href).toBe(
      `/dashboard/messages/${offer.value.conversationId}`,
    );

    // Gone from every public query.
    expect(await getListing(listing.slug)).toBeNull();
    const browse = await queryListings(emptyFilters);
    expect(browse.items.map((item) => item.id)).not.toContain(listing.id);

    // And the trail says who did it.
    const trail = await db.auditLog.findFirstOrThrow({
      where: { action: "listing.seller_remove", entityId: listing.id },
    });
    expect(trail.actorId).toBe(seller.id);
    expect(trail.after).toMatchObject({
      status: "REMOVED",
      dealsClosed: 1,
      offersDeclined: 1,
    });

    // A second tap is not an error, and closes nothing twice.
    expect(await removeMyListing(seller.id, listing.id)).toMatchObject({
      ok: true,
      outcome: "removed",
    });
    expect(
      await db.notification.count({
        where: { userId: buyer.id, kind: "ORDER" },
      }),
    ).toBe(1);
  }),
);

test(
  "removing is refused while a paid deal runs, and nothing closes",
  withCleanDb(async () => {
    const { listing, seller, buyer } = await seedListing();
    const deal = await createDeal({
      listingId: listing.id,
      buyerId: buyer.id,
      mode: "FASTEST",
    });
    if (!deal.ok) throw new Error(deal.reason);
    // Paid: the listing is reserved for this buyer.
    await db.order.update({
      where: { id: deal.orderId },
      data: { paymentRef: "test-paid", status: "AGENT_VERIFYING" },
    });
    await db.listing.update({
      where: { id: listing.id },
      data: { status: "RESERVED" },
    });
    expect(await removeMyListing(seller.id, listing.id)).toEqual({
      ok: false,
      reason: "reserved",
    });

    // Paused under the same paid deal, by a suspension: still refused.
    await db.listing.update({
      where: { id: listing.id },
      data: { status: "PAUSED" },
    });
    expect(await removeMyListing(seller.id, listing.id)).toEqual({
      ok: false,
      reason: "in-deal",
    });

    const after = await db.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(after.status).toBe("PAUSED");
    expect(after.rejectionReason).toBeNull();
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: deal.orderId } }))
        .status,
    ).toBe("AGENT_VERIFYING");
  }),
);

test(
  "a sold listing cannot be removed",
  withCleanDb(async () => {
    const { listing, seller } = await seedListing({ listingStatus: "SOLD" });
    expect(await removeMyListing(seller.id, listing.id)).toEqual({
      ok: false,
      reason: "sold",
    });
  }),
);

test(
  "removing waits while a buyer's crypto payment is on its way",
  withCleanDb(async () => {
    const { listing, seller, buyer } = await seedListing();
    const deal = await createDeal({
      listingId: listing.id,
      buyerId: buyer.id,
      mode: "FASTEST",
    });
    if (!deal.ok) throw new Error(deal.reason);
    await db.invoice.create({
      data: {
        reference: "test-invoice",
        purpose: "DEAL",
        amountUsd: 10_300,
        userId: buyer.id,
        orderId: deal.orderId,
      },
    });
    expect(await removeMyListing(seller.id, listing.id)).toEqual({
      ok: false,
      reason: "paying",
    });
    expect(
      (await db.listing.findUniqueOrThrow({ where: { id: listing.id } }))
        .status,
    ).toBe("LIVE");
  }),
);

test(
  "a listing in review is taken off for good, not deleted",
  withCleanDb(async () => {
    const { listing, seller } = await seedListing({
      listingStatus: "ADMIN_REVIEW",
    });
    expect(await removeMyListing(seller.id, listing.id)).toMatchObject({
      ok: true,
      outcome: "removed",
    });
    expect(
      (await db.listing.findUniqueOrThrow({ where: { id: listing.id } }))
        .status,
    ).toBe("REMOVED");
  }),
);

test(
  "removing a draft still deletes it",
  withCleanDb(async () => {
    const { listing, seller } = await seedListing({ listingStatus: "DRAFT" });
    const locks = await getListingLocks(seller.id, listing.id);
    expect(locks).toMatchObject({ canRemove: true, deletes: true });

    expect(await removeMyListing(seller.id, listing.id)).toMatchObject({
      ok: true,
      outcome: "deleted",
    });
    expect(
      await db.listing.findUnique({ where: { id: listing.id } }),
    ).toBeNull();
  }),
);

test(
  "a draft that was once on sale is removed, not deleted, so its buyers keep their chats",
  withCleanDb(async () => {
    const { listing, seller, buyer } = await seedListing();
    const offer = await createOffer({
      buyerId: buyer.id,
      listingId: listing.id,
      amountCents: 8_000,
      message: "Would you take this?",
      expiryHours: 48,
    });
    if (!offer.ok) throw new Error(offer.reason);
    // Taken down, reopened, sent back: a draft again, with history.
    await db.offer.update({
      where: { id: offer.value.offerId },
      data: { status: "EXPIRED" },
    });
    await db.listing.update({
      where: { id: listing.id },
      data: { status: "REJECTED" },
    });

    expect(await removeMyListing(seller.id, listing.id)).toMatchObject({
      ok: true,
      outcome: "removed",
    });
    expect(
      (await db.listing.findUniqueOrThrow({ where: { id: listing.id } }))
        .status,
    ).toBe("REMOVED");
    // The buyer's chat about it is still there.
    expect(
      await db.message.count({ where: { listingId: listing.id } }),
    ).toBeGreaterThan(0);
  }),
);

test(
  "nobody removes a listing that is not theirs",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    expect(await removeMyListing(buyer.id, listing.id)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(
      (await db.listing.findUniqueOrThrow({ where: { id: listing.id } }))
        .status,
    ).toBe("LIVE");
  }),
);
