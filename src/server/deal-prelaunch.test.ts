import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { countAgentHolds } from "@/server/admin-users";
import {
  advanceStep,
  closedForPayment,
  createDeal,
  getDealFor,
  payToMissing,
  recordOpeningPayment,
  resolveDeal,
  secondApproversFor,
} from "@/server/deals";
import { payFromWallet } from "@/server/wallet";
import { passHold, seedListing, seedUser, withCleanDb } from "@/test/db";

/**
 * The deal fixes from the pre-launch QA of 2026-10-26: second approval with
 * one superadmin, reasons reaching the other side, wallet lines that name
 * the deal, the seller told when the buyer pays, and the buyer who lost the
 * race to pay told why.
 */

type Seeded = Awaited<ReturnType<typeof seedListing>>;

async function open(
  mode: "SAFEST" | "FASTEST",
  seeded?: Seeded,
  options: { agent?: boolean } = {},
) {
  const s = seeded ?? (await seedListing());
  const created = await createDeal({
    listingId: s.listing.id,
    buyerId: s.buyer.id,
    mode,
    acceptedRevenueRisk: true,
    handoverTo: "buyer-channel@example.test",
  });
  if (!created.ok) throw new Error(created.reason);
  if (options.agent !== false) {
    await db.order.update({
      where: { id: created.orderId },
      data: {
        agentId: s.agent.id,
        agentEmail: "transfers@channeladda.test",
        agentBrand: "Channel Adda Transfers",
      },
    });
  }
  return { ...s, orderId: created.orderId };
}

async function step(orderId: string, position: number, userId: string) {
  const done = await advanceStep({ orderId, position, userId });
  if (!done.ok) throw new Error(`step ${position}: ${done.reason}`);
}

async function bodies(userId: string): Promise<string[]> {
  const rows = await db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { title: true, body: true },
  });
  return rows.map((row) => `${row.title} | ${row.body}`);
}

// ------------------------------------------------------ second approval

test(
  "the second approver list never offers the acting agent, and says when there is nobody else",
  withCleanDb(async () => {
    // QA, CA-23139: a $6,000 deal run by the only superadmin listed her as
    // her own second approver, and the server rightly refused it.
    const seeded = await seedListing({ priceUsd: 600_000 });
    const boss = await db.user.update({
      where: { id: seeded.agent.id },
      data: { role: "SUPERADMIN" },
    });
    const t = await open("FASTEST", seeded);
    await recordOpeningPayment(t.orderId, `pay-${t.orderId}`, "USDT");
    await step(t.orderId, 2, t.seller.id);
    await step(t.orderId, 3, boss.id);
    await passHold(t.orderId);
    await step(t.orderId, 4, t.seller.id);

    const deal = await getDealFor(boss.id, t.orderId);
    if (!deal) throw new Error("no deal");
    expect(await secondApproversFor(deal, boss.id)).toEqual([]);

    const other = await seedUser("MODERATOR");
    const listed = await secondApproversFor(deal, boss.id);
    expect(listed?.map((p) => p.id)).toEqual([other.id]);
  }),
);

test(
  "below the second-approval amount nobody is asked to name an approver",
  withCleanDb(async () => {
    const t = await open("FASTEST");
    await recordOpeningPayment(t.orderId, `pay-${t.orderId}`, "USDT");
    await step(t.orderId, 2, t.seller.id);
    await step(t.orderId, 3, t.agent.id);
    await passHold(t.orderId);
    await step(t.orderId, 4, t.seller.id);
    await seedUser("MODERATOR");
    const deal = await getDealFor(t.agent.id, t.orderId);
    if (!deal) throw new Error("no deal");
    expect(await secondApproversFor(deal, t.agent.id)).toBeUndefined();
  }),
);

// ------------------------------------------------------ why it ended

test(
  "a member's cancel reason reaches the other side, without contact details",
  withCleanDb(async () => {
    // QA, CA-17288: the seller had to give a reason, and the buyer saw
    // only "Deal cancelled".
    const t = await open("FASTEST");
    expect(
      await resolveDeal({
        orderId: t.orderId,
        to: "CANCELLED",
        byUserId: t.seller.id,
        note: "Changed my mind, call me on +8801712345678",
      }),
    ).toEqual({ ok: true });

    const told = (await bodies(t.buyer.id)).join("\n");
    expect(told).toMatch(/Test Seller cancelled the deal/);
    expect(told).toMatch(/Changed my mind/);
    expect(told).not.toMatch(/8801712345678/);

    const line = await db.message.findFirstOrThrow({
      where: { orderId: t.orderId, kind: "EVENT" },
      orderBy: { createdAt: "desc" },
      select: { body: true },
    });
    expect(line.body).toMatch(/^Test Seller cancelled this deal/);
    expect(line.body).not.toMatch(/8801712345678/);

    const page = await getDealFor(t.buyer.id, t.orderId);
    expect(page?.endedLine).toMatch(/^The seller cancelled this deal/);
    expect(page?.endedLine).toMatch(/Changed my mind/);
  }),
);

test(
  "a dispute pauses the deal, and the other side is told what it is about",
  withCleanDb(async () => {
    const t = await open("FASTEST");
    await recordOpeningPayment(t.orderId, `pay-${t.orderId}`, "USDT");
    await resolveDeal({
      orderId: t.orderId,
      to: "DISPUTED",
      byUserId: t.buyer.id,
      note: "The seller stopped answering. Email me at me@example.com",
    });
    const seller = (await bodies(t.seller.id)).join("\n");
    expect(seller).toMatch(/Deal paused/);
    expect(seller).toMatch(/The seller stopped answering/);
    expect(seller).not.toMatch(/me@example\.com/);
    // A pause is not an ending.
    expect(seller).not.toMatch(/has closed/);
    expect((await bodies(t.buyer.id)).join("\n")).not.toMatch(/has closed/);
  }),
);

// ------------------------------------------------------ wallet lines

test(
  "a refund names the deal in the buyer's wallet, and the decider's note stays in the audit trail",
  withCleanDb(async () => {
    // QA: the moderator's working note was shown word for word to the buyer.
    const t = await open("FASTEST");
    const { reference } = await db.order.findUniqueOrThrow({
      where: { id: t.orderId },
      select: { reference: true },
    });
    await recordOpeningPayment(t.orderId, `pay-${t.orderId}`, "USDT");
    const finance = await seedUser("FINANCE");
    await resolveDeal({
      orderId: t.orderId,
      to: "DISPUTED",
      byUserId: t.buyer.id,
      note: "Nothing is happening.",
    });
    await resolveDeal({
      orderId: t.orderId,
      to: "REFUNDED",
      byUserId: finance.id,
      note: "QA: listing overstated members. Refunding in full.",
    });
    const row = await db.ledgerEntry.findFirstOrThrow({
      where: { orderId: t.orderId, userId: t.buyer.id, kind: "REFUND" },
    });
    expect(row.note).toBe(`Refund · ${reference}`);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { entityId: t.orderId, action: "deal.refunded" },
    });
    expect(JSON.stringify(audit.after)).toMatch(/overstated members/);

    const page = await getDealFor(t.buyer.id, t.orderId);
    expect(page?.refundedUsd).toBe(row.amountUsd);
  }),
);

test(
  "a Fastest seller's payout names the sale in their wallet",
  withCleanDb(async () => {
    const t = await open("FASTEST");
    await recordOpeningPayment(t.orderId, `pay-${t.orderId}`, "USDT");
    await step(t.orderId, 2, t.seller.id);
    await step(t.orderId, 3, t.agent.id);
    await passHold(t.orderId);
    await step(t.orderId, 4, t.seller.id);
    await step(t.orderId, 5, t.agent.id);
    const { reference } = await db.order.findUniqueOrThrow({
      where: { id: t.orderId },
      select: { reference: true },
    });
    const row = await db.ledgerEntry.findFirstOrThrow({
      where: { orderId: t.orderId, userId: t.seller.id },
    });
    expect(row.note).toBe(`Sale of Test channel · ${reference}`);
  }),
);

// ------------------------------------------------------ who hears what

test(
  "the seller is told the moment the buyer pays, before an agent is assigned",
  withCleanDb(async () => {
    const t = await open("FASTEST", undefined, { agent: false });
    await recordOpeningPayment(t.orderId, `pay-${t.orderId}`, "USDT");
    const told = await bodies(t.seller.id);
    expect(told.some((line) => line.startsWith("The buyer has paid"))).toBe(
      true,
    );
  }),
);

test(
  "an Instagram seller's turn is asked for in Instagram's words",
  withCleanDb(async () => {
    const seeded = await seedListing();
    await db.listing.update({
      where: { id: seeded.listing.id },
      data: { platform: "INSTAGRAM" },
    });
    const t = await open("FASTEST", seeded);
    await recordOpeningPayment(t.orderId, `pay-${t.orderId}`, "USDT");
    const told = (await bodies(t.seller.id)).join("\n");
    expect(told).toMatch(/Send our agent the login/);
    expect(told).not.toMatch(/owner/);
  }),
);

// ------------------------------------------------------ the race to pay

test(
  "the buyer who lost the race to pay is told another buyer paid first, and was not charged",
  withCleanDb(async () => {
    // QA, CA-75504 / CA-27051: paying from a page loaded before the other
    // buyer paid said "This deal is not waiting on a payment".
    const seeded = await seedListing();
    const late = await open("FASTEST", seeded);
    const rival = await seedUser();
    const first = await createDeal({
      listingId: seeded.listing.id,
      buyerId: rival.id,
      mode: "FASTEST",
      acceptedRevenueRisk: true,
      handoverTo: "rival@example.test",
    });
    if (!first.ok) throw new Error(first.reason);
    await recordOpeningPayment(first.orderId, `pay-${first.orderId}`, "USDT");

    expect(await payFromWallet(late.orderId, seeded.buyer.id)).toMatchObject({
      ok: false,
    });
    expect(await closedForPayment(late.orderId, seeded.buyer.id)).toBe(
      "Another buyer paid first, so this deal has closed. You were not charged.",
    );
  }),
);

// ------------------------------------------------------ steps

test(
  "a step pressed again says it is already done",
  withCleanDb(async () => {
    const t = await open("FASTEST");
    await recordOpeningPayment(t.orderId, `pay-${t.orderId}`, "USDT");
    await step(t.orderId, 2, t.seller.id);
    expect(
      await advanceStep({
        orderId: t.orderId,
        position: 2,
        userId: t.seller.id,
      }),
    ).toEqual({ ok: false, reason: "already-done" });
  }),
);

test(
  "a Safest buyer's Paid waits until the seller has said where to pay",
  withCleanDb(async () => {
    const t = await open("SAFEST");
    expect(await payToMissing(t.orderId, 6)).toBe(true);
    // Only the Paid step waits for it.
    expect(await payToMissing(t.orderId, 2)).toBe(false);
    await db.order.update({
      where: { id: t.orderId },
      data: { sellerPayTo: "bKash 01XXXXXXXXX", sellerPayToAt: new Date() },
    });
    expect(await payToMissing(t.orderId, 6)).toBe(false);
  }),
);

// ------------------------------------------------------ the agent's cap

test(
  "Team counts an agent's Fastest and disputed holds, as the cap does",
  withCleanDb(async () => {
    // QA, CA-17139: Team said "5 of 10" while taking a deal was refused at
    // the cap, because it counted Safest holds alone.
    const t = await open("FASTEST");
    await recordOpeningPayment(t.orderId, `pay-${t.orderId}`, "USDT");
    await step(t.orderId, 2, t.seller.id);
    await step(t.orderId, 3, t.agent.id);
    expect(await countAgentHolds(t.agent.id)).toBe(1);
  }),
);

test(
  "a seller is never shown a staff member's sign-in email as the account to invite",
  withCleanDb(async () => {
    const seeded = await seedListing();
    const t = await open("FASTEST", seeded, { agent: false });
    // A deal assigned the old way, with the agent's login email copied on.
    await db.order.update({
      where: { id: t.orderId },
      data: {
        agentId: seeded.agent.id,
        agentEmail: seeded.agent.email,
        agentBrand: "Channel Adda Transfers",
      },
    });
    expect(
      (await getDealFor(seeded.seller.id, t.orderId))?.agentEmail,
    ).toBeNull();
    // A transfer identity of their own is shown.
    await db.order.update({
      where: { id: t.orderId },
      data: { agentEmail: "transfers@channeladda.test" },
    });
    expect((await getDealFor(seeded.seller.id, t.orderId))?.agentEmail).toBe(
      "transfers@channeladda.test",
    );
  }),
);
