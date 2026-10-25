import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import type { Platform } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { templateFor, usesCurrentSteps } from "@/lib/deal-templates";
import {
  advanceStep,
  announceEndedHolds,
  createDeal,
  endHoldNow,
  recordOpeningPayment,
} from "@/server/deals";
import { passHold, seedListing, seedUser, withCleanDb } from "@/test/db";
import { runStep } from "@/test/deal-steps";

// The client (2026-10-25): on a Safest deal, once the seller has been paid,
// run the 7-day wait again, and tell people when the buyer can be made
// primary owner. Google makes any new owner wait seven days before they can
// be made primary owner — the buyer as much as our agent — so the handover
// is two steps with the wait between them, as it is on Fastest.

/** A Safest deal with the seller's Received pressed: steps 1 to 7 done. */
async function sellerConfirmed(platform: Platform = "YOUTUBE") {
  const seeded = await seedListing();
  await db.listing.update({
    where: { id: seeded.listing.id },
    data: { platform },
  });
  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode: "SAFEST",
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
  const actors: Record<string, string> = {
    buyer: seeded.buyer.id,
    seller: seeded.seller.id,
    agent: seeded.agent.id,
  };
  for (const step of templateFor("SAFEST")) {
    if (step.position < 2 || step.position > 7) continue;
    const done = await runStep({
      orderId,
      position: step.position,
      userId: actors[step.actor],
    });
    if (!done.ok) throw new Error(`step ${step.position}: ${done.reason}`);
  }
  return { ...seeded, orderId, conversationId };
}

const order = (id: string) => db.order.findUniqueOrThrow({ where: { id } });

const titlesFor = async (userId: string) =>
  (await db.notification.findMany({ where: { userId } })).map((n) => n.title);

test("Safest ends: invite the buyer, Google's wait, then make them primary owner", () => {
  const steps = templateFor("SAFEST");
  expect(steps.slice(-2).map((s) => [s.label, s.actor])).toEqual([
    ["Invite the buyer as owner", "agent"],
    ["Make the buyer primary owner", "agent"],
  ]);
  const [invite, primary] = steps.slice(-2);
  expect(invite).toMatchObject({ startsHold: true, usesHandover: true });
  expect(invite.entersStatus).toBeUndefined();
  expect(invite.handsOver).toBeUndefined();
  expect(primary).toMatchObject({
    entersStatus: "COMPLETED",
    handsOver: true,
    needsApprovalAbove: true,
  });
});

test(
  "after the seller is paid, inviting the buyer starts a 7-day wait before the deal can finish",
  withCleanDb(async () => {
    const t = await sellerConfirmed();

    expect(
      await advanceStep({
        orderId: t.orderId,
        position: 8,
        userId: t.agent.id,
      }),
    ).toEqual({ ok: true });

    const waiting = await order(t.orderId);
    expect(waiting.status).toBe("AWAITING_HANDOVER");
    expect(waiting.handoverAt).toBeNull();
    const days =
      ((waiting.holdUntil?.getTime() ?? 0) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);

    // The buyer has something to do — accept the invite — and is told.
    expect(await titlesFor(t.buyer.id)).toContain(
      `Accept our agent's owner invite — ${waiting.reference}`,
    );

    expect(
      await advanceStep({
        orderId: t.orderId,
        position: 9,
        userId: t.agent.id,
      }),
    ).toEqual({ ok: false, reason: "on-hold" });
  }),
);

test(
  "when the wait ends our agent is told to make the buyer primary owner, and the buyer hears too",
  withCleanDb(async () => {
    const t = await sellerConfirmed();
    await advanceStep({ orderId: t.orderId, position: 8, userId: t.agent.id });
    await passHold(t.orderId);

    expect(await announceEndedHolds()).toBe(1);
    const { reference } = await order(t.orderId);
    expect(await titlesFor(t.agent.id)).toContain(
      `Make the buyer primary owner — ${reference}`,
    );
    expect(await titlesFor(t.buyer.id)).toContain(
      `You become primary owner next — ${reference}`,
    );

    expect(
      await advanceStep({
        orderId: t.orderId,
        position: 9,
        userId: t.agent.id,
      }),
    ).toEqual({ ok: true });
    const done = await order(t.orderId);
    expect(done.status).toBe("COMPLETED");
    expect(done.handoverAt).not.toBeNull();
  }),
);

test(
  "staff ending the wait early tells the buyer as well",
  withCleanDb(async () => {
    const t = await sellerConfirmed();
    const moderator = await seedUser("MODERATOR");
    await advanceStep({ orderId: t.orderId, position: 8, userId: t.agent.id });

    expect(
      await endHoldNow({ orderId: t.orderId, byUserId: moderator.id }),
    ).toEqual({ ok: true });
    const { reference } = await order(t.orderId);
    expect(await titlesFor(t.buyer.id)).toContain(
      `You become primary owner next — ${reference}`,
    );
  }),
);

test(
  "on a platform with no Google wait the last step opens at once",
  withCleanDb(async () => {
    const t = await sellerConfirmed("INSTAGRAM");
    await advanceStep({ orderId: t.orderId, position: 8, userId: t.agent.id });
    expect((await order(t.orderId)).holdUntil).toBeNull();
    expect(
      await advanceStep({
        orderId: t.orderId,
        position: 9,
        userId: t.agent.id,
      }),
    ).toEqual({ ok: true });
  }),
);

const OLD_SAFEST = [
  "Pay the admin fee",
  "Invite the agent as owner",
  "Accept the owner invite",
  "Make the agent primary owner",
  "Verify the channel",
  "Pay the seller",
  "Confirm the payment arrived",
  "Transfer ownership to the buyer",
];

/** A Safest deal on the steps of 2026-10-20, done up to `done`. */
async function oldSafest(
  done: number,
  status: "IN_CUSTODY" | "AWAITING_HANDOVER" | "COMPLETED",
) {
  const t = await sellerConfirmed();
  await db.transferStep.deleteMany({ where: { orderId: t.orderId } });
  await db.transferStep.createMany({
    data: OLD_SAFEST.map((label, index) => ({
      orderId: t.orderId,
      position: index + 1,
      label,
      actor: templateFor("SAFEST")[index].actor,
      completedAt: index < done ? new Date() : null,
    })),
  });
  await db.order.update({ where: { id: t.orderId }, data: { status } });
  return t;
}

const labels = async (orderId: string) =>
  (
    await db.transferStep.findMany({
      where: { orderId },
      orderBy: { position: "asc" },
    })
  ).map((s) => s.label);

test(
  "the migration moves running Safest deals onto the new steps and leaves finished ones",
  withCleanDb(async () => {
    const running = await oldSafest(6, "IN_CUSTODY");
    const handingOver = await oldSafest(7, "AWAITING_HANDOVER");
    const finished = await oldSafest(8, "COMPLETED");

    const sql = readFileSync(
      "prisma/migrations/20261025120000_safest_buyer_wait/migration.sql",
      "utf8",
    );
    await db.$executeRawUnsafe(sql);

    for (const t of [running, handingOver]) {
      expect(usesCurrentSteps("SAFEST", await labels(t.orderId))).toBe(true);
    }
    expect(await labels(finished.orderId)).toEqual(OLD_SAFEST);

    // And the deal that was waiting on the handover now runs the new end.
    expect(
      await advanceStep({
        orderId: handingOver.orderId,
        position: 8,
        userId: handingOver.agent.id,
      }),
    ).toEqual({ ok: true });
    expect((await order(handingOver.orderId)).holdUntil).not.toBeNull();
  }),
);
