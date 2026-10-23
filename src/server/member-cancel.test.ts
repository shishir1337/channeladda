import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { db } from "@/lib/db";
import {
  advanceStep,
  balanceOf,
  createDeal,
  recordOpeningPayment,
  resolveDeal,
} from "@/server/deals";
import { seedListing, withCleanDb } from "@/test/db";

// The owner: "there is no option to cancel — suppose the seller wants to
// cancel this deal, he can't." Until the seller has handed anything over,
// a deal is nothing but money we hold, so either side may call it off and
// the buyer gets back every cent. After that our agent has access to the
// channel, and giving it back is our team's job, through a dispute.

async function paidDeal(mode: "SAFEST" | "FASTEST") {
  const seeded = await seedListing();
  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode,
  });
  if (!created.ok) throw new Error(created.reason);
  const paid = await recordOpeningPayment(
    created.orderId,
    `pay-${randomUUID()}`,
    "USDT",
  );
  if (paid !== "applied") throw new Error(paid);
  await db.order.update({
    where: { id: created.orderId },
    data: { agentId: seeded.agent.id },
  });
  const order = await db.order.findUniqueOrThrow({
    where: { id: created.orderId },
  });
  return { ...seeded, order };
}

test(
  "the seller can cancel a paid Safest deal before inviting our agent, and the buyer gets their fee back",
  withCleanDb(async () => {
    const { order, seller, buyer, listing } = await paidDeal("SAFEST");

    const result = await resolveDeal({
      orderId: order.id,
      to: "CANCELLED",
      byUserId: seller.id,
      note: "Sold it elsewhere",
    });

    expect(result).toMatchObject({ ok: true });
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe("CANCELLED");
    expect(await balanceOf(buyer.id)).toBe(order.totalUsd);
    const back = await db.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(back.status).toBe("LIVE");
  }),
);

test(
  "the buyer can cancel a paid Fastest deal before the seller invites our agent, and gets everything back",
  withCleanDb(async () => {
    const { order, buyer } = await paidDeal("FASTEST");

    const result = await resolveDeal({
      orderId: order.id,
      to: "CANCELLED",
      byUserId: buyer.id,
      note: "Changed my mind",
    });

    expect(result).toMatchObject({ ok: true });
    expect(await balanceOf(buyer.id)).toBe(order.totalUsd);
  }),
);

test(
  "once the seller has invited our agent, neither side can cancel alone",
  withCleanDb(async () => {
    for (const mode of ["SAFEST", "FASTEST"] as const) {
      const { order, seller, buyer } = await paidDeal(mode);
      const invited = await advanceStep({
        orderId: order.id,
        position: 2,
        userId: seller.id,
      });
      expect(invited).toMatchObject({ ok: true });

      for (const who of [seller.id, buyer.id]) {
        const result = await resolveDeal({
          orderId: order.id,
          to: "CANCELLED",
          byUserId: who,
          note: "Want out",
        });
        expect(result).toEqual({ ok: false, reason: "seller-started" });
      }
      expect(await balanceOf(buyer.id)).toBe(0);
    }
  }),
);
