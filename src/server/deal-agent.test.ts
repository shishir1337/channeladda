import { expect, test } from "vitest";
import type { OrderStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { templateFor } from "@/lib/deal-templates";
import {
  advanceStep,
  assignAgent,
  createDeal,
  holdsFor,
  recordOpeningPayment,
} from "@/server/deals";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

/** Every state in which a Safest agent is holding the seller's channel. */
const HOLDING: readonly OrderStatus[] = [
  "AWAITING_CUSTODY",
  "IN_CUSTODY",
  "AWAITING_BUYER_PAYMENT",
  "AWAITING_HANDOVER",
];

async function dealFor(
  mode: "SAFEST" | "FASTEST",
  opts: { priceUsd?: number; settings?: Record<string, number> } = {},
) {
  const seeded = await seedListing({
    priceUsd: opts.priceUsd,
    settings: opts.settings,
  });
  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode,
  });
  if (!created.ok) throw new Error(`createDeal: ${created.reason}`);
  return { ...seeded, orderId: created.orderId };
}

test(
  "assignment records the agent's email and brand",
  withCleanDb(async () => {
    const { orderId, agent } = await dealFor("SAFEST");
    const staff = await seedUser("MODERATOR");

    expect(
      await assignAgent({
        orderId,
        agentId: agent.id,
        agentEmail: "transfers@channeladda.test",
        agentBrand: "Channel Adda Transfers",
        byUserId: staff.id,
      }),
    ).toMatchObject({ ok: true });

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.agentId).toBe(agent.id);
    expect(order.agentEmail).toBe("transfers@channeladda.test");
    expect(order.agentBrand).toBe("Channel Adda Transfers");
  }),
);

test(
  "only staff may assign an agent",
  withCleanDb(async () => {
    const { orderId, agent, buyer } = await dealFor("SAFEST");
    expect(
      await assignAgent({
        orderId,
        agentId: agent.id,
        agentEmail: "a@b.test",
        agentBrand: "X",
        byUserId: buyer.id,
      }),
    ).toMatchObject({ ok: false, reason: "wrong-actor" });
  }),
);

test(
  "the assignee must actually hold the agent role",
  withCleanDb(async () => {
    const { orderId, seller } = await dealFor("SAFEST");
    const staff = await seedUser("MODERATOR");
    expect(
      await assignAgent({
        orderId,
        agentId: seller.id,
        agentEmail: "a@b.test",
        agentBrand: "X",
        byUserId: staff.id,
      }),
    ).toMatchObject({ ok: false, reason: "wrong-actor" });
  }),
);

test(
  "holds count only safest orders the agent is still holding",
  withCleanDb(async () => {
    const agent = await seedUser("AGENT");

    // One per holding state, plus a completed one and a Fastest one, which
    // tie up no channel.
    for (const status of [...HOLDING, "COMPLETED" as OrderStatus]) {
      const { orderId } = await dealFor("SAFEST");
      await db.order.update({
        where: { id: orderId },
        data: { agentId: agent.id, status },
      });
    }
    const fastest = await dealFor("FASTEST");
    await db.order.update({
      where: { id: fastest.orderId },
      data: { agentId: agent.id, status: "AWAITING_HANDOVER" },
    });

    expect(await holdsFor(agent.id)).toBe(HOLDING.length);
  }),
);

test(
  "assignment past the cap is refused",
  withCleanDb(async () => {
    const agent = await seedUser("AGENT");
    const staff = await seedUser("MODERATOR");

    const first = await dealFor("SAFEST", {
      settings: { maxHoldsPerAgent: 1 },
    });
    expect(
      await assignAgent({
        orderId: first.orderId,
        agentId: agent.id,
        agentEmail: "a@b.test",
        agentBrand: "X",
        byUserId: staff.id,
      }),
    ).toMatchObject({ ok: true });
    await db.order.update({
      where: { id: first.orderId },
      data: { status: "AWAITING_CUSTODY" },
    });

    const second = await dealFor("SAFEST", {
      settings: { maxHoldsPerAgent: 1 },
    });
    expect(
      await assignAgent({
        orderId: second.orderId,
        agentId: agent.id,
        agentEmail: "a@b.test",
        agentBrand: "X",
        byUserId: staff.id,
      }),
    ).toMatchObject({ ok: false, reason: "cap-reached" });
  }),
);

test(
  "the cap survives two concurrent assignments",
  withCleanDb(async () => {
    const agent = await seedUser("AGENT");
    const staff = await seedUser("MODERATOR");

    const a = await dealFor("SAFEST", { settings: { maxHoldsPerAgent: 1 } });
    const b = await dealFor("SAFEST", { settings: { maxHoldsPerAgent: 1 } });
    await db.order.updateMany({
      where: { id: { in: [a.orderId, b.orderId] } },
      data: { status: "AWAITING_CUSTODY" },
    });

    const results = await Promise.all([
      assignAgent({
        orderId: a.orderId,
        agentId: agent.id,
        agentEmail: "a@b.test",
        agentBrand: "X",
        byUserId: staff.id,
      }),
      assignAgent({
        orderId: b.orderId,
        agentId: agent.id,
        agentEmail: "a@b.test",
        agentBrand: "X",
        byUserId: staff.id,
      }),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await holdsFor(agent.id)).toBe(1);
  }),
);

test(
  "reassignment does not count the order against the new agent twice",
  withCleanDb(async () => {
    const staff = await seedUser("MODERATOR");
    const first = await seedUser("AGENT");
    const second = await seedUser("AGENT");
    const { orderId } = await dealFor("SAFEST", {
      settings: { maxHoldsPerAgent: 1 },
    });

    await assignAgent({
      orderId,
      agentId: first.id,
      agentEmail: "a@b.test",
      agentBrand: "X",
      byUserId: staff.id,
    });
    await db.order.update({
      where: { id: orderId },
      data: { status: "IN_CUSTODY" },
    });

    // Handing the same order to someone else must not be read as that person
    // taking on a second channel.
    expect(
      await assignAgent({
        orderId,
        agentId: second.id,
        agentEmail: "c@d.test",
        agentBrand: "Y",
        byUserId: staff.id,
      }),
    ).toMatchObject({ ok: true });
    expect(await holdsFor(first.id)).toBe(0);
    expect(await holdsFor(second.id)).toBe(1);
  }),
);

/** Drives a Safest deal to the handover step, which is the guarded one. */
async function atHandover(priceUsd: number) {
  const seeded = await dealFor("SAFEST", { priceUsd });
  const staff = await seedUser("MODERATOR");
  await db.order.update({
    where: { id: seeded.orderId },
    data: { agentId: seeded.agent.id },
  });
  await recordOpeningPayment(seeded.orderId, `pay-${seeded.orderId}`, "USDT");

  const actors: Record<string, string> = {
    buyer: seeded.buyer.id,
    seller: seeded.seller.id,
    agent: seeded.agent.id,
  };
  for (const step of templateFor("SAFEST")) {
    if (step.position < 2 || step.position >= 8) continue;
    const r = await advanceStep({
      orderId: seeded.orderId,
      position: step.position,
      userId: actors[step.actor],
      ...(step.position === 6 ? { paymentRef: "0xabc" } : {}),
    });
    if (!r.ok) throw new Error(`step ${step.position}: ${r.reason}`);
  }
  return { ...seeded, staff, actors };
}

test(
  "a high-value handover needs a second approver",
  withCleanDb(async () => {
    const { orderId, actors, staff } = await atHandover(600_000);

    expect(
      await advanceStep({ orderId, position: 8, userId: actors.agent }),
    ).toMatchObject({ ok: false, reason: "needs-approval" });

    expect(
      await advanceStep({
        orderId,
        position: 8,
        userId: actors.agent,
        approvedById: staff.id,
      }),
    ).toMatchObject({ ok: true });

    const step = await db.transferStep.findFirstOrThrow({
      where: { orderId, position: 8 },
    });
    expect(step.approvedById).toBe(staff.id);
  }),
);

test(
  "a handover below the threshold needs no approver",
  withCleanDb(async () => {
    const { orderId, actors } = await atHandover(10_000);
    expect(
      await advanceStep({ orderId, position: 8, userId: actors.agent }),
    ).toMatchObject({ ok: true });
  }),
);

test(
  "the approver cannot be the agent themselves",
  withCleanDb(async () => {
    const { orderId, actors } = await atHandover(600_000);
    expect(
      await advanceStep({
        orderId,
        position: 8,
        userId: actors.agent,
        approvedById: actors.agent,
      }),
    ).toMatchObject({ ok: false, reason: "needs-approval" });
  }),
);

test(
  "the approver must be staff",
  withCleanDb(async () => {
    const { orderId, actors } = await atHandover(600_000);
    expect(
      await advanceStep({
        orderId,
        position: 8,
        userId: actors.agent,
        approvedById: actors.buyer,
      }),
    ).toMatchObject({ ok: false, reason: "needs-approval" });
  }),
);

test(
  "an agent can claim an unassigned deal themselves",
  withCleanDb(async () => {
    // The queue only works if an agent can take the next job without waiting
    // for a moderator to hand it to them.
    const { orderId, agent } = await dealFor("SAFEST");
    expect(
      await assignAgent({
        orderId,
        agentId: agent.id,
        agentEmail: "transfers@channeladda.test",
        agentBrand: "Channel Adda Transfers",
        byUserId: agent.id,
      }),
    ).toMatchObject({ ok: true });
  }),
);

test(
  "an agent cannot take a deal off another agent",
  withCleanDb(async () => {
    const { orderId, agent } = await dealFor("SAFEST");
    const staff = await seedUser("MODERATOR");
    const poacher = await seedUser("AGENT");

    await assignAgent({
      orderId,
      agentId: agent.id,
      agentEmail: "a@b.test",
      agentBrand: "X",
      byUserId: staff.id,
    });

    expect(
      await assignAgent({
        orderId,
        agentId: poacher.id,
        agentEmail: "c@d.test",
        agentBrand: "Y",
        byUserId: poacher.id,
      }),
    ).toMatchObject({ ok: false, reason: "wrong-actor" });
  }),
);

test(
  "an agent cannot assign a different agent",
  withCleanDb(async () => {
    const { orderId, agent } = await dealFor("SAFEST");
    const other = await seedUser("AGENT");
    expect(
      await assignAgent({
        orderId,
        agentId: other.id,
        agentEmail: "c@d.test",
        agentBrand: "Y",
        byUserId: agent.id,
      }),
    ).toMatchObject({ ok: false, reason: "wrong-actor" });
  }),
);
