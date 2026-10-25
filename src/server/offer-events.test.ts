import { beforeEach, expect, test, vi } from "vitest";
import { db } from "@/lib/db";
import { listThreads, openConversation } from "@/server/messages";
import {
  acceptOffer,
  counterOffer,
  createOffer,
  declineOffer,
  expireOffers,
  releaseLapsedOfferReservations,
  withdrawOffer,
} from "@/server/offers";
import type { CurrentUser } from "@/server/session";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

/**
 * Every offer leaves its mark in the conversation, whichever page it came
 * from — so the thread is the record of the negotiation, and the people in
 * it hear about each move.
 */

// Mail is observed rather than sent: a mail path is configured, and every
// message lands here so a test can say who was emailed.
const mail = vi.hoisted(() => ({ sent: [] as { to: string }[] }));
vi.mock("@/server/mailer", () => ({
  canSendMail: () => true,
  sendMail: async (m: { to: string }) => {
    mail.sent.push(m);
  },
}));
beforeEach(() => {
  mail.sent.length = 0;
});

const HOUR = 3_600_000;

function asUser(id: string): CurrentUser {
  return {
    id,
    email: "someone@example.test",
    name: "Someone",
    image: null,
    emailVerified: true,
    role: "USER",
    slug: null,
    banned: false,
  };
}

async function offer(
  listingId: string,
  buyerId: string,
  amountCents = 8_000,
  message: string | null = null,
) {
  const made = await createOffer({
    buyerId,
    listingId,
    amountCents,
    message,
    expiryHours: 48,
  });
  if (!made.ok) throw new Error(made.reason);
  return made.value;
}

/** The conversation between this buyer and the listing's seller. */
const thread = (listingId: string, buyerId: string) =>
  db.conversation.findFirstOrThrow({
    where: { buyerId, seller: { listings: { some: { id: listingId } } } },
  });

const entries = (conversationId: string) =>
  db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

test(
  "an offer from the listing page starts a conversation with its card",
  withCleanDb(async () => {
    const { listing, buyer, seller } = await seedListing();
    const { offerId, conversationId } = await offer(listing.id, buyer.id);

    expect((await thread(listing.id, buyer.id)).id).toBe(conversationId);
    const all = await entries(conversationId);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      kind: "OFFER",
      offerId,
      senderId: buyer.id,
    });

    // The seller finds it in their inbox, not only on the Offers page.
    const inbox = await listThreads(asUser(seller.id));
    expect(inbox.map((t) => t.id)).toContain(conversationId);
  }),
);

test(
  "an offer into an existing conversation adds its card",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const opened = await openConversation({
      listingId: listing.id,
      buyerId: buyer.id,
    });
    if (!opened.ok) throw new Error(opened.reason);

    const { conversationId } = await offer(listing.id, buyer.id);
    expect(conversationId).toBe(opened.id);
    const all = await entries(opened.id);
    expect(all.map((m) => m.kind)).toEqual(["TEXT", "OFFER"]);
  }),
);

test(
  "a counter adds a card for the new offer and tells the buyer",
  withCleanDb(async () => {
    const { listing, buyer, seller } = await seedListing();
    const first = await offer(listing.id, buyer.id);

    const countered = await counterOffer({
      offerId: first.offerId,
      responderId: seller.id,
      as: "seller",
      amountCents: 9_000,
      message: null,
      expiryHours: 48,
    });
    if (!countered.ok) throw new Error(countered.reason);

    const all = await entries(first.conversationId);
    const card = all.at(-1);
    expect(card).toMatchObject({
      kind: "OFFER",
      offerId: countered.value.offerId,
      senderId: seller.id,
    });

    // Nobody was told about a counter before.
    const told = await db.notification.findMany({
      where: { userId: buyer.id, kind: "OFFER" },
    });
    expect(told).toHaveLength(1);
    expect(told[0].href).toBe(`/dashboard/messages/${first.conversationId}`);
    expect(mail.sent.map((m) => m.to)).toContain(buyer.email);
  }),
);

test(
  "accepting writes an event and tells the other buyers",
  withCleanDb(async () => {
    const { listing, buyer, seller } = await seedListing();
    const other = await seedUser();
    const mine = await offer(listing.id, buyer.id);
    const theirs = await offer(listing.id, other.id);
    mail.sent.length = 0;

    const accepted = await acceptOffer(mine.offerId, seller.id, "seller");
    expect(accepted.ok).toBe(true);

    const here = await entries(mine.conversationId);
    expect(here.at(-1)).toMatchObject({
      kind: "EVENT",
      offerId: mine.offerId,
      senderId: seller.id,
    });

    const there = await entries(theirs.conversationId);
    expect(there.at(-1)).toMatchObject({
      kind: "EVENT",
      offerId: theirs.offerId,
      senderId: null,
    });
    expect(there.at(-1)?.body).toMatch(/another buyer/);

    // Told, in the bell, without an email.
    const told = await db.notification.findMany({
      where: { userId: other.id },
    });
    expect(told).toHaveLength(1);
    expect(told[0].href).toBe(`/dashboard/messages/${theirs.conversationId}`);
    expect(mail.sent.map((m) => m.to)).not.toContain(other.email);
    // The buyer whose offer was accepted is emailed, as before.
    expect(mail.sent.map((m) => m.to)).toContain(buyer.email);
    const acceptedNote = await db.notification.findFirstOrThrow({
      where: { userId: buyer.id, kind: "OFFER" },
    });
    expect(acceptedNote.href).toBe(
      `/dashboard/messages/${mine.conversationId}`,
    );
  }),
);

test(
  "declining and withdrawing write events",
  withCleanDb(async () => {
    const { listing, buyer, seller } = await seedListing();
    const first = await offer(listing.id, buyer.id);
    expect((await declineOffer(first.offerId, seller.id, "seller")).ok).toBe(
      true,
    );

    const second = await offer(listing.id, buyer.id, 8_500);
    expect((await withdrawOffer(second.offerId, buyer.id)).ok).toBe(true);

    const all = await entries(first.conversationId);
    expect(all.map((m) => [m.kind, m.offerId, m.senderId])).toEqual([
      ["OFFER", first.offerId, buyer.id],
      ["EVENT", first.offerId, seller.id],
      ["OFFER", second.offerId, buyer.id],
      ["EVENT", second.offerId, buyer.id],
    ]);

    const declined = await db.notification.findFirstOrThrow({
      where: { userId: buyer.id, kind: "OFFER" },
    });
    expect(declined.href).toBe(`/dashboard/messages/${first.conversationId}`);
    // The seller hears about the withdrawal, without an email.
    const withdrawn = await db.notification.findMany({
      where: { userId: seller.id, kind: "OFFER" },
      orderBy: { createdAt: "asc" },
    });
    expect(withdrawn.at(-1)?.href).toBe(
      `/dashboard/messages/${first.conversationId}`,
    );
  }),
);

test(
  "the sweep writes one event per expired offer",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const other = await seedUser();
    const a = await offer(listing.id, buyer.id);
    const b = await offer(listing.id, other.id);
    await db.offer.updateMany({
      data: { expiresAt: new Date(Date.now() - HOUR) },
    });

    // Two sweeps at once: each offer expires once between them.
    const [x, y] = await Promise.all([expireOffers(), expireOffers()]);
    expect(x + y).toBe(2);

    const events = await db.message.findMany({ where: { kind: "EVENT" } });
    expect(events).toHaveLength(2);
    expect(events.map((m) => m.conversationId).sort()).toEqual(
      [a.conversationId, b.conversationId].sort(),
    );
    expect(events.every((m) => m.senderId === null)).toBe(true);
    expect(await expireOffers()).toBe(0);
  }),
);

test(
  "a lapsed acceptance writes an event in the buyer's thread",
  withCleanDb(async () => {
    const { listing, buyer, seller } = await seedListing();
    const made = await offer(listing.id, buyer.id);
    expect((await acceptOffer(made.offerId, seller.id, "seller")).ok).toBe(
      true,
    );
    await db.offer.update({
      where: { id: made.offerId },
      data: { respondedAt: new Date(Date.now() - 49 * HOUR) },
    });

    expect(await releaseLapsedOfferReservations()).toBe(1);
    const last = (await entries(made.conversationId)).at(-1);
    expect(last).toMatchObject({ kind: "EVENT", offerId: made.offerId });
    expect(last?.body).toMatch(/back on sale/);

    const told = await db.notification.findFirstOrThrow({
      where: { userId: buyer.id, title: { contains: "lapsed" } },
    });
    expect(told.href).toBe(`/dashboard/messages/${made.conversationId}`);
  }),
);

test(
  "a note that is only a phone number is stored as the marker",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const made = await offer(listing.id, buyer.id, 8_000, "+880 1712 345678");

    const row = await db.offer.findUniqueOrThrow({
      where: { id: made.offerId },
    });
    expect(row.message).toBe("[contact details removed]");
    const conversation = await thread(listing.id, buyer.id);
    expect(conversation.flaggedAt).not.toBeNull();
  }),
);

test(
  "a note in a closed conversation is refused, the offer without one goes through",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const opened = await openConversation({
      listingId: listing.id,
      buyerId: buyer.id,
    });
    if (!opened.ok) throw new Error(opened.reason);
    await db.conversation.update({
      where: { id: opened.id },
      data: { closedAt: new Date() },
    });

    const withNote = await createOffer({
      buyerId: buyer.id,
      listingId: listing.id,
      amountCents: 8_000,
      message: "Can you do this?",
      expiryHours: 48,
    });
    expect(withNote).toEqual({ ok: false, reason: "closed" });

    const without = await createOffer({
      buyerId: buyer.id,
      listingId: listing.id,
      amountCents: 8_000,
      message: null,
      expiryHours: 48,
    });
    expect(without.ok).toBe(true);
  }),
);

test(
  "a closed conversation still lets offers be answered",
  withCleanDb(async () => {
    const { listing, buyer, seller } = await seedListing();
    const first = await offer(listing.id, buyer.id);
    await db.conversation.update({
      where: { id: first.conversationId },
      data: { closedAt: new Date() },
    });

    const countered = await counterOffer({
      offerId: first.offerId,
      responderId: seller.id,
      as: "seller",
      amountCents: 9_000,
      message: null,
      expiryHours: 48,
    });
    if (!countered.ok) throw new Error(countered.reason);
    expect(
      (await declineOffer(countered.value.offerId, buyer.id, "buyer")).ok,
    ).toBe(true);

    const again = await offer(listing.id, buyer.id, 8_800);
    expect((await acceptOffer(again.offerId, seller.id, "seller")).ok).toBe(
      true,
    );
  }),
);

test(
  "two counters pressed at once make one",
  withCleanDb(async () => {
    // A chat button is easy to press twice. The second press must find the
    // offer already answered, not open a second live offer beside the first.
    const { listing, buyer, seller } = await seedListing();
    const first = await offer(listing.id, buyer.id);
    const press = () =>
      counterOffer({
        offerId: first.offerId,
        responderId: seller.id,
        as: "seller",
        amountCents: 9_000,
        message: null,
        expiryHours: 48,
      });
    const results = await Promise.all([press(), press()]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(
      await db.offer.count({
        where: { listingId: listing.id, status: "OPEN" },
      }),
    ).toBe(1);
  }),
);

test(
  "making an offer points the seller at the conversation",
  withCleanDb(async () => {
    const { listing, buyer, seller } = await seedListing();
    const made = await offer(listing.id, buyer.id);
    const told = await db.notification.findFirstOrThrow({
      where: { userId: seller.id, kind: "OFFER" },
    });
    expect(told.href).toBe(`/dashboard/messages/${made.conversationId}`);
    expect(mail.sent.map((m) => m.to)).toContain(seller.email);
  }),
);

test(
  "accepting never tells the winning buyer they lost",
  withCleanDb(async () => {
    // An offer past its expiry stays OPEN until the sweep runs, and a buyer
    // can make a fresh one beside it. Accepting the fresh one used to close
    // the stale one as "the listing went to another buyer" — to the buyer
    // who had just won it.
    const { listing, buyer, seller } = await seedListing();
    const stale = await offer(listing.id, buyer.id, 7_000);
    await db.offer.update({
      where: { id: stale.offerId },
      data: { expiresAt: new Date(Date.now() - HOUR) },
    });
    const fresh = await offer(listing.id, buyer.id, 8_000);
    await db.notification.deleteMany();

    expect((await acceptOffer(fresh.offerId, seller.id, "seller")).ok).toBe(
      true,
    );

    const lines = await entries(fresh.conversationId);
    expect(lines.some((m) => /another buyer/.test(m.body))).toBe(false);
    const told = await db.notification.findMany({
      where: { userId: buyer.id },
    });
    expect(told.map((n) => n.title)).toEqual([
      `Your offer of $80.00 was accepted`,
    ]);
    const old = await db.offer.findUniqueOrThrow({
      where: { id: stale.offerId },
    });
    expect(old.status).toBe("EXPIRED");
  }),
);
