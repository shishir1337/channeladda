import { expect, test } from "vitest";
import type { DealLevel, DealMode, UserRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { setUserRole } from "@/server/admin-users";
import {
  advanceStep,
  assignAgent,
  createDeal,
  getDealFor,
  recordOpeningPayment,
  resolveDeal,
} from "@/server/deals";
import { roleInThread } from "@/server/messages";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

// The client's ask: moderators run deals as the agent, not only agents, each
// at a level by deal size — level 1 under $10,000, level 2 under $100,000,
// level 3 from $100,000 — and the superadmin can run one too.

async function staff(role: UserRole, dealLevel: DealLevel | null = null) {
  const user = await seedUser(role);
  return db.user.update({
    where: { id: user.id },
    data: {
      dealLevel,
      agentEmail: `${role.toLowerCase()}-desk@channeladda.test`,
      agentBrand: "Channel Adda Transfers",
    },
  });
}

/** A paid deal at this price, waiting for somebody to run it. */
async function paidDeal(priceCents: number, mode: DealMode = "FASTEST") {
  const seeded = await seedListing({ priceUsd: priceCents });
  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode,
    acceptedRevenueRisk: true,
  });
  if (!created.ok) throw new Error(created.reason);
  await recordOpeningPayment(created.orderId, `pay-${created.orderId}`, "USDT");
  return { ...seeded, orderId: created.orderId };
}

function assign(orderId: string, agentId: string, byUserId: string) {
  return assignAgent({
    orderId,
    agentId,
    agentEmail: "typed@example.test",
    agentBrand: "Typed",
    byUserId,
  });
}

test(
  "a moderator can be put on a deal in their level and run its agent steps",
  withCleanDb(async () => {
    const admin = await staff("SUPERADMIN");
    const moderator = await staff("MODERATOR", "UNDER_10K");
    const deal = await paidDeal(250_000, "SAFEST"); // $2,500

    expect(await assign(deal.orderId, moderator.id, admin.id)).toEqual({
      ok: true,
    });
    expect((await getDealFor(moderator.id, deal.orderId))?.viewerRole).toBe(
      "agent",
    );

    // Safest: the seller adds the agent as manager, the agent confirms it.
    await advanceStep({
      orderId: deal.orderId,
      position: 2,
      userId: deal.seller.id,
    });
    expect(
      await advanceStep({
        orderId: deal.orderId,
        position: 3,
        userId: moderator.id,
      }),
    ).toMatchObject({ ok: true });
  }),
);

test(
  "a deal outside a moderator's level is refused, whether assigned or claimed",
  withCleanDb(async () => {
    const admin = await staff("SUPERADMIN");
    const level1 = await staff("MODERATOR", "UNDER_10K");
    const level3 = await staff("MODERATOR", "FROM_100K");
    const deal = await paidDeal(1_000_000); // exactly $10,000: level 2

    expect(await assign(deal.orderId, level1.id, admin.id)).toEqual({
      ok: false,
      reason: "out-of-level",
    });
    // Claiming for themselves goes through the same check.
    expect(await assign(deal.orderId, level3.id, level3.id)).toEqual({
      ok: false,
      reason: "out-of-level",
    });
    const order = await db.order.findUniqueOrThrow({
      where: { id: deal.orderId },
    });
    expect(order.agentId).toBeNull();
  }),
);

test(
  "the superadmin can run a deal of any size",
  withCleanDb(async () => {
    const admin = await staff("SUPERADMIN", "UNDER_10K");
    const deal = await paidDeal(50_000_000); // $500,000
    expect(await assign(deal.orderId, admin.id, admin.id)).toEqual({
      ok: true,
    });
  }),
);

test(
  "an agent with no level set still takes a deal of any size, as before levels",
  withCleanDb(async () => {
    const admin = await staff("SUPERADMIN");
    const agent = await staff("AGENT");
    const deal = await paidDeal(50_000_000);
    expect(await assign(deal.orderId, agent.id, admin.id)).toEqual({
      ok: true,
    });
  }),
);

test(
  "finance never runs a deal: it moves the money",
  withCleanDb(async () => {
    const admin = await staff("SUPERADMIN");
    const finance = await staff("FINANCE");
    const deal = await paidDeal(250_000);
    expect(await assign(deal.orderId, finance.id, admin.id)).toEqual({
      ok: false,
      reason: "wrong-actor",
    });
  }),
);

test(
  "a moderator running a deal is its agent in the conversation, not a reader",
  withCleanDb(async () => {
    const admin = await staff("SUPERADMIN");
    const moderator = await staff("MODERATOR", "UNDER_10K");
    const deal = await paidDeal(250_000);
    await assign(deal.orderId, moderator.id, admin.id);

    const order = await db.order.findUniqueOrThrow({
      where: { id: deal.orderId },
      select: { conversationId: true },
    });
    const thread = await db.conversation.findUniqueOrThrow({
      where: { id: order.conversationId ?? "" },
      select: { id: true, buyerId: true, sellerId: true },
    });
    expect(
      await roleInThread(
        {
          id: moderator.id,
          role: "MODERATOR",
          name: moderator.name,
          email: moderator.email,
          emailVerified: true,
        } as Parameters<typeof roleInThread>[0],
        thread,
      ),
    ).toBe("agent");
  }),
);

test(
  "a moderator running a deal keeps their staff powers on it",
  withCleanDb(async () => {
    // There is nobody else to hand a dispute to: the owner said so.
    const admin = await staff("SUPERADMIN");
    const moderator = await staff("MODERATOR", "UNDER_10K");
    const deal = await paidDeal(250_000);
    await assign(deal.orderId, moderator.id, admin.id);

    expect(
      await resolveDeal({
        orderId: deal.orderId,
        to: "DISPUTED",
        byUserId: moderator.id,
        note: "Seller stopped answering.",
      }),
    ).toMatchObject({ ok: true });
  }),
);

test(
  "promoting an agent to moderator keeps the access email sellers are given",
  withCleanDb(async () => {
    const admin = await staff("SUPERADMIN");
    const agent = await staff("AGENT");
    await setUserRole({
      actorId: admin.id,
      userId: agent.id,
      role: "MODERATOR",
    });
    const after = await db.user.findUniqueOrThrow({ where: { id: agent.id } });
    expect(after.agentEmail).toBe("agent-desk@channeladda.test");

    await setUserRole({ actorId: admin.id, userId: agent.id, role: "FINANCE" });
    const finance = await db.user.findUniqueOrThrow({
      where: { id: agent.id },
    });
    expect(finance.agentEmail).toBeNull();
  }),
);
