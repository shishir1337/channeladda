import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { templateFor } from "@/lib/deal-templates";
import {
  createDeal,
  getDealFor,
  recordOpeningPayment,
  resolveDeal,
} from "@/server/deals";
import { saveSellerPayTo } from "@/server/pay-to";
import { seedListing, seedUser, withCleanDb } from "@/test/db";
import { runStep } from "@/test/deal-steps";

/**
 * Where a Safest buyer pays the seller.
 *
 * The chat filter removes bKash and bank account numbers — they look like
 * phone numbers — so the seller says it here instead. Shown to the buyer only once
 * it is their turn to pay, and every change after that is loud, because
 * re-pointing a payment is what a hijacked account does.
 */

const DETAILS = "USDT (TRC20): TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE";

/** A paid Safest deal with an agent, run up to (not including) `stopBefore`. */
async function safestTo(
  stopBefore: number,
  options: { details?: string } = {},
) {
  const seeded = await seedListing();
  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode: "SAFEST",
    acceptedRevenueRisk: true,
  });
  if (!created.ok) throw new Error(created.reason);
  const { orderId } = created;
  await db.order.update({
    where: { id: orderId },
    data: {
      agentId: seeded.agent.id,
      agentEmail: "transfers@channeladda.test",
      agentBrand: "Channel Adda Transfers",
    },
  });
  await recordOpeningPayment(orderId, `pay-${orderId}`, "USDT");
  if (options.details) {
    const saved = await saveSellerPayTo({
      orderId,
      userId: seeded.seller.id,
      text: options.details,
    });
    if (!saved.ok) throw new Error(saved.reason);
  }

  const actors: Record<string, string> = {
    buyer: seeded.buyer.id,
    seller: seeded.seller.id,
    agent: seeded.agent.id,
  };
  for (const step of templateFor("SAFEST")) {
    if (step.position < 2 || step.position >= stopBefore) continue;
    const done = await runStep({
      orderId,
      position: step.position,
      userId: actors[step.actor],
    });
    if (!done.ok) throw new Error(`${step.position}: ${done.reason}`);
  }
  return { ...seeded, orderId };
}

test(
  "the seller saves details, the buyer sees them only at their payment step",
  withCleanDb(async () => {
    const t = await safestTo(2, { details: DETAILS });

    expect((await getDealFor(t.seller.id, t.orderId))?.sellerPayTo).toBe(
      DETAILS,
    );
    expect((await getDealFor(t.agent.id, t.orderId))?.sellerPayTo).toBe(
      DETAILS,
    );
    const early = await getDealFor(t.buyer.id, t.orderId);
    expect(early?.sellerPayTo).toBeNull();
    expect(early?.buyerPayStepReached).toBe(false);

    // Steps 2 to 5: the owner invite, Google's wait, primary ownership and
    // our agent verifying the channel.
    const actors: Record<string, string> = {
      seller: t.seller.id,
      agent: t.agent.id,
    };
    for (const step of templateFor("SAFEST")) {
      if (step.position < 2 || step.position > 5) continue;
      const done = await runStep({
        orderId: t.orderId,
        position: step.position,
        userId: actors[step.actor],
      });
      if (!done.ok) throw new Error(`${step.position}: ${done.reason}`);
    }
    const now = await getDealFor(t.buyer.id, t.orderId);
    expect(now?.sellerPayTo).toBe(DETAILS);
    expect(now?.buyerPayStepReached).toBe(true);
    expect(now?.payToChangedWhileVisible).toBe(false);
  }),
);

test(
  "a change after the buyer could see it warns and notifies the buyer",
  withCleanDb(async () => {
    const t = await safestTo(6, { details: DETAILS });
    // A change before the buyer could see it was nothing to warn about.
    expect(
      (await getDealFor(t.buyer.id, t.orderId))?.payToChangedWhileVisible,
    ).toBe(false);

    const changed = await saveSellerPayTo({
      orderId: t.orderId,
      userId: t.seller.id,
      text: "USDT (TRC20): TNewAddressForTheBuyerToCheck0000000",
    });
    expect(changed).toEqual({ ok: true });

    const view = await getDealFor(t.buyer.id, t.orderId);
    expect(view?.payToChangedWhileVisible).toBe(true);
    const told = await db.notification.findMany({
      where: { userId: t.buyer.id, title: { contains: "changed where" } },
    });
    expect(told).toHaveLength(1);
    expect(told[0].href).toMatch(/^\/dashboard\/messages\//);
  }),
);

test(
  "details lock once the buyer records the payment",
  withCleanDb(async () => {
    const t = await safestTo(7, { details: DETAILS });
    expect(
      await saveSellerPayTo({
        orderId: t.orderId,
        userId: t.seller.id,
        text: "Somewhere else",
      }),
    ).toEqual({ ok: false, reason: "locked" });
  }),
);

test(
  "links are refused, emails are not",
  withCleanDb(async () => {
    const t = await safestTo(2);
    expect(
      await saveSellerPayTo({
        orderId: t.orderId,
        userId: t.seller.id,
        text: "Pay on https://pay.example.com/me",
      }),
    ).toEqual({ ok: false, reason: "has-link" });
    expect(
      await saveSellerPayTo({
        orderId: t.orderId,
        userId: t.seller.id,
        text: "PayPal: nadia@paypal.com",
      }),
    ).toEqual({ ok: true });
  }),
);

test(
  "only the seller, only on Safest, only on a running deal",
  withCleanDb(async () => {
    const t = await safestTo(2);
    const save = (userId: string, text = DETAILS, orderId = t.orderId) =>
      saveSellerPayTo({ orderId, userId, text });

    expect(await save(t.buyer.id)).toEqual({
      ok: false,
      reason: "wrong-actor",
    });
    expect(await save(t.agent.id)).toEqual({
      ok: false,
      reason: "wrong-actor",
    });
    const stranger = await seedUser();
    expect(await save(stranger.id)).toEqual({ ok: false, reason: "not-found" });
    expect(await save(t.seller.id, "   ")).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(await save(t.seller.id, "x".repeat(501))).toEqual({
      ok: false,
      reason: "too-long",
    });

    // Fastest: the platform pays the seller; there is nothing to say here.
    const other = await seedListing();
    const fastest = await createDeal({
      listingId: other.listing.id,
      buyerId: other.buyer.id,
      mode: "FASTEST",
      acceptedRevenueRisk: true,
    });
    if (!fastest.ok) throw new Error(fastest.reason);
    expect(
      await saveSellerPayTo({
        orderId: fastest.orderId,
        userId: other.seller.id,
        text: DETAILS,
      }),
    ).toEqual({ ok: false, reason: "not-safest" });

    // A deal that has ended takes no new details.
    const staff = await seedUser("MODERATOR");
    const third = await seedListing();
    const ended = await createDeal({
      listingId: third.listing.id,
      buyerId: third.buyer.id,
      mode: "SAFEST",
      acceptedRevenueRisk: true,
    });
    if (!ended.ok) throw new Error(ended.reason);
    const cancelled = await resolveDeal({
      orderId: ended.orderId,
      to: "CANCELLED",
      byUserId: staff.id,
      note: "Never paid.",
    });
    if (!cancelled.ok) throw new Error(cancelled.reason);
    expect(
      await saveSellerPayTo({
        orderId: ended.orderId,
        userId: third.seller.id,
        text: DETAILS,
      }),
    ).toEqual({ ok: false, reason: "terminal" });
  }),
);

test(
  "the event never contains the details",
  withCleanDb(async () => {
    const t = await safestTo(2, { details: DETAILS });
    const lines = await db.message.findMany({ where: { orderId: t.orderId } });
    expect(lines.some((m) => /added where to be paid/.test(m.body))).toBe(true);
    expect(lines.some((m) => m.body.includes("TQn9Y2"))).toBe(false);
    const notes = await db.notification.findMany();
    expect(notes.some((n) => `${n.title} ${n.body}`.includes("TQn9Y2"))).toBe(
      false,
    );
  }),
);

test(
  "the seller is reminded once when the buyer is ready to pay and nothing is set",
  withCleanDb(async () => {
    const t = await safestTo(6);
    const reminders = await db.notification.findMany({
      where: { userId: t.seller.id, title: { contains: "ready to pay you" } },
    });
    expect(reminders).toHaveLength(1);

    // Nobody is reminded when the details were already there.
    const u = await safestTo(6, { details: DETAILS });
    expect(
      await db.notification.count({
        where: { userId: u.seller.id, title: { contains: "ready to pay you" } },
      }),
    ).toBe(0);
  }),
);

test(
  "details added once the buyer is waiting for them tell the buyer",
  withCleanDb(async () => {
    // The buyer reached their turn and was told the seller had not said
    // where to pay. When the seller does, the buyer hears about it.
    const t = await safestTo(6);
    const saved = await saveSellerPayTo({
      orderId: t.orderId,
      userId: t.seller.id,
      text: DETAILS,
    });
    expect(saved).toEqual({ ok: true });
    const told = await db.notification.findMany({
      where: { userId: t.buyer.id, title: { contains: "added where" } },
    });
    expect(told).toHaveLength(1);
  }),
);
