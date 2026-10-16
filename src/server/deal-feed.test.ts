import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { templateFor } from "@/lib/deal-templates";
import { recordAudit } from "@/server/audit";
import { listDealActivity } from "@/server/deal-feed";
import {
  advanceStep,
  assignAgent,
  createDeal,
  recordOpeningPayment,
} from "@/server/deals";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

async function completeSafestDeal() {
  const seeded = await seedListing();
  const staff = await seedUser("MODERATOR");

  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode: "SAFEST",
  });
  if (!created.ok) throw new Error(created.reason);
  const { orderId } = created;

  await assignAgent({
    orderId,
    agentId: seeded.agent.id,
    agentEmail: "transfers@channeladda.test",
    agentBrand: "Channel Adda Transfers",
    byUserId: staff.id,
  });
  await recordOpeningPayment(orderId, `pay-${orderId}`, "USDT");

  const actors: Record<string, string> = {
    buyer: seeded.buyer.id,
    seller: seeded.seller.id,
    agent: seeded.agent.id,
  };
  for (const step of templateFor("SAFEST")) {
    if (step.position < 2) continue;
    const r = await advanceStep({
      orderId,
      position: step.position,
      userId: actors[step.actor],
      ...(step.position === 6 ? { paymentRef: "0xabc" } : {}),
    });
    if (!r.ok) throw new Error(`step ${step.position}: ${r.reason}`);
  }

  return { ...seeded, orderId, staff, actors };
}

test(
  "every stage of a deal reaches the feed, newest first",
  withCleanDb(async () => {
    const { orderId } = await completeSafestDeal();

    const rows = await listDealActivity();
    const actions = rows.map((r) => r.action);

    expect(actions).toContain("deal.created");
    expect(actions).toContain("deal.fee_paid");
    expect(actions).toContain("deal.agent_assigned");
    expect(actions).toContain("deal.step_completed");
    expect(actions).toContain("deal.completed");

    // One row per advanced step, plus creation, payment and assignment.
    expect(rows.length).toBeGreaterThanOrEqual(9);
    expect(rows.every((r) => r.orderId === orderId)).toBe(true);

    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(
        rows[i].createdAt.getTime(),
      );
    }
  }),
);

test(
  "a system transition is recorded with no actor",
  withCleanDb(async () => {
    const seeded = await seedListing();
    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "SAFEST",
    });
    if (!created.ok) throw new Error(created.reason);
    await recordOpeningPayment(created.orderId, "pay-1", "USDT");

    const row = await db.auditLog.findFirstOrThrow({
      where: { action: "deal.fee_paid" },
    });
    expect(row.actorId).toBeNull();

    const [feedRow] = (await listDealActivity()).filter(
      (r) => r.action === "deal.fee_paid",
    );
    expect(feedRow.actorName).toBeNull();
  }),
);

test(
  "the feed carries order activity and nothing else",
  withCleanDb(async () => {
    const { seller, listing } = await completeSafestDeal();
    await recordAudit({
      actorId: seller.id,
      action: "listing.approve",
      entity: "listing",
      entityId: listing.id,
    });

    const rows = await listDealActivity();
    expect(rows.map((r) => r.action)).not.toContain("listing.approve");
  }),
);

test(
  "a feed row carries the reference, the listing and the amount",
  withCleanDb(async () => {
    const { listing } = await completeSafestDeal();
    const [row] = await listDealActivity();

    expect(row.orderReference).toMatch(/^CA-\d{5}$/);
    expect(row.listingTitle).toBe(listing.title);
    expect(row.orderStatus).toBe("COMPLETED");
    // A Safest buyer owes the 3% fee alone.
    expect(row.amountUsd).toBe(300);
    expect(row.actorName).not.toBeNull();
  }),
);

test(
  "the feed honours its limit",
  withCleanDb(async () => {
    await completeSafestDeal();
    expect(await listDealActivity(3)).toHaveLength(3);
  }),
);

test(
  "an audit row whose order has gone is left out rather than crashing",
  withCleanDb(async () => {
    const { orderId } = await completeSafestDeal();
    // AuditLog has no foreign key to Order on purpose: the trail outlives the
    // thing it describes. The feed still has to cope.
    await db.order.delete({ where: { id: orderId } });
    expect(await listDealActivity()).toEqual([]);
  }),
);

test(
  "resolution reaches the feed under its own name",
  withCleanDb(async () => {
    const seeded = await seedListing();
    const staff = await seedUser("MODERATOR");
    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "FASTEST",
    });
    if (!created.ok) throw new Error(created.reason);
    await recordOpeningPayment(created.orderId, "pay-r", "USDT");

    const { resolveDeal } = await import("@/server/deals");
    await resolveDeal({
      orderId: created.orderId,
      to: "REFUNDED",
      byUserId: staff.id,
      note: "transfer failed",
    });

    const rows = await listDealActivity();
    expect(rows.map((r) => r.action)).toContain("deal.refunded");
    expect(rows[0].actorName).toBe(staff.name);
  }),
);
