import { expect, test } from "vitest";
import { db } from "@/lib/db";
import {
  advanceStep,
  createDeal,
  endHoldNow,
  recordOpeningPayment,
  resolveDeal,
} from "@/server/deals";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

// The owner: "how to complete this 7 days timer manually from admin panel?"
// Google sometimes lets the transfer through before the seven days are up,
// and staff were ending the wait from psql. Now a moderator ends it from the
// deal, the chat says so, and the next person is told it is their move.

/** A Fastest deal in its holding period: steps 2 and 3 done. */
async function onHold() {
  const seeded = await seedListing();
  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode: "FASTEST",
    acceptedRevenueRisk: true,
    handoverTo: "buyer-channel@example.test",
  });
  if (!created.ok) throw new Error(created.reason);
  const { orderId, conversationId } = created;
  await db.order.update({
    where: { id: orderId },
    data: {
      agentId: seeded.agent.id,
      agentEmail: "transfers@channeladda.test",
      agentBrand: "Channel Adda Transfers",
    },
  });
  await recordOpeningPayment(orderId, `pay-${orderId}`, "USDT");
  for (const [position, userId] of [
    [2, seeded.seller.id],
    [3, seeded.agent.id],
  ] as const) {
    const done = await advanceStep({ orderId, position, userId });
    if (!done.ok) throw new Error(`step ${position}: ${done.reason}`);
  }
  return { ...seeded, orderId, conversationId };
}

test(
  "a moderator ends the wait, and the next step opens at once",
  withCleanDb(async () => {
    const t = await onHold();
    const moderator = await seedUser("MODERATOR");

    expect(
      await advanceStep({
        orderId: t.orderId,
        position: 4,
        userId: t.seller.id,
      }),
    ).toEqual({ ok: false, reason: "on-hold" });

    expect(
      await endHoldNow({ orderId: t.orderId, byUserId: moderator.id }),
    ).toEqual({ ok: true });

    const order = await db.order.findUniqueOrThrow({
      where: { id: t.orderId },
    });
    expect(order.holdUntil?.getTime()).toBeLessThanOrEqual(Date.now());
    // Announced here, so the sweep does not announce it a second time.
    expect(order.holdNotifiedAt).not.toBeNull();

    const lines = await db.message.findMany({
      where: { conversationId: t.conversationId, kind: "EVENT" },
      select: { body: true },
    });
    expect(lines.map((l) => l.body)).toContain(
      "The waiting period is over. The next step is open",
    );
    expect(
      await db.auditLog.count({
        where: { action: "deal.hold_ended", entityId: t.orderId },
      }),
    ).toBe(1);

    expect(
      await advanceStep({
        orderId: t.orderId,
        position: 4,
        userId: t.seller.id,
      }),
    ).toEqual({ ok: true });
  }),
);

test(
  "only a moderator or the owner can end it, not the buyer, seller or agent",
  withCleanDb(async () => {
    const t = await onHold();
    const finance = await seedUser("FINANCE");
    for (const userId of [t.buyer.id, t.seller.id, t.agent.id, finance.id]) {
      expect(
        await endHoldNow({ orderId: t.orderId, byUserId: userId }),
      ).toEqual({ ok: false, reason: "wrong-actor" });
    }
    const owner = await seedUser("SUPERADMIN");
    expect(
      await endHoldNow({ orderId: t.orderId, byUserId: owner.id }),
    ).toEqual({ ok: true });
  }),
);

test(
  "a deal with no wait running, or a paused one, is left as it is",
  withCleanDb(async () => {
    const t = await onHold();
    const moderator = await seedUser("MODERATOR");

    await endHoldNow({ orderId: t.orderId, byUserId: moderator.id });
    expect(
      await endHoldNow({ orderId: t.orderId, byUserId: moderator.id }),
    ).toEqual({ ok: false, reason: "not-on-hold" });

    const paused = await onHold();
    await resolveDeal({
      orderId: paused.orderId,
      to: "DISPUTED",
      byUserId: paused.buyer.id,
      note: "the seller stopped answering",
    });
    expect(
      await endHoldNow({ orderId: paused.orderId, byUserId: moderator.id }),
    ).toEqual({ ok: false, reason: "disputed" });
  }),
);
