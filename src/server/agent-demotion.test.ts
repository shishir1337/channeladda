import { expect, test } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { templateFor } from "@/lib/deal-templates";
import { setUserRole } from "@/server/admin-users";
import { listDealsNeedingReassignment } from "@/server/deal-feed";
import { advanceStep, createDeal, recordOpeningPayment } from "@/server/deals";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

/** A Safest deal with its agent at the handover step, then the agent moved. */
async function heldByAgentMovedTo(role: UserRole) {
  const seeded = await seedListing();
  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode: "SAFEST",
  });
  if (!created.ok) throw new Error(created.reason);
  const orderId = created.orderId;
  await db.order.update({
    where: { id: orderId },
    data: { agentId: seeded.agent.id },
  });
  await recordOpeningPayment(orderId, `pay-${orderId}`, "USDT");

  const actors: Record<string, string> = {
    buyer: seeded.buyer.id,
    seller: seeded.seller.id,
    agent: seeded.agent.id,
  };
  for (const step of templateFor("SAFEST")) {
    if (step.position < 2 || step.position >= 8) continue;
    const r = await advanceStep({
      orderId,
      position: step.position,
      userId: actors[step.actor],
      ...(step.position === 6 ? { paymentRef: "0xabc" } : {}),
    });
    if (!r.ok) throw new Error(`step ${step.position}: ${r.reason}`);
  }

  const superadmin = await seedUser("SUPERADMIN");
  const moved = await setUserRole({
    actorId: superadmin.id,
    userId: seeded.agent.id,
    role,
  });
  if (!moved.ok) throw new Error(`setUserRole: ${moved.reason}`);
  return { ...seeded, orderId };
}

test(
  "an agent moved to another role can no longer work the deals they held",
  withCleanDb(async () => {
    // Moving a suspected-compromised agent out of the role was supposed to
    // take their desk away. The deal still named them as its agent, so they
    // could sign back in and hand the channel over anyway.
    for (const role of ["USER", "FINANCE"] as const) {
      const { orderId, agent } = await heldByAgentMovedTo(role);

      expect(
        await advanceStep({ orderId, position: 8, userId: agent.id }),
      ).toMatchObject({ ok: false });
      const handover = await db.transferStep.findFirstOrThrow({
        where: { orderId, position: 8 },
      });
      expect(handover.completedAt).toBeNull();
    }
  }),
);

test(
  "deals held by an agent moved to another role wait for reassignment",
  withCleanDb(async () => {
    // The reassignment queue matched suspended agents only, and it is the
    // one place staff can move a deal. A demoted agent's channels were held
    // by nobody who could act, with no screen to fix it.
    const { orderId } = await heldByAgentMovedTo("USER");

    const waiting = await listDealsNeedingReassignment();
    expect(waiting.map((order) => order.id)).toContain(orderId);
  }),
);
