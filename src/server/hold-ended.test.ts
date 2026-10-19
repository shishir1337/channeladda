import { expect, test } from "vitest";
import { db } from "@/lib/db";
import {
  advanceStep,
  announceEndedHolds,
  countDealsAwaiting,
  createDeal,
  listDealsFor,
  recordOpeningPayment,
  resolveDeal,
} from "@/server/deals";
import { passHold, seedListing, withCleanDb } from "@/test/db";

// The client's step 4: "7 din pure hote hi seller ko notification aur email
// jaata hai". Nobody presses anything when a wait ends, so without the sweep
// the seller learns their step is open only by happening to look.

async function inHold(mode: "SAFEST" | "FASTEST") {
  const seeded = await seedListing();
  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode,
    acceptedRevenueRisk: true,
  });
  if (!created.ok) throw new Error(created.reason);
  await db.order.update({
    where: { id: created.orderId },
    data: { agentId: seeded.agent.id },
  });
  await recordOpeningPayment(created.orderId, `pay-${created.orderId}`, "USDT");
  const confirmer = mode === "SAFEST" ? seeded.agent : seeded.buyer;
  for (const [position, userId] of [
    [2, seeded.seller.id],
    [3, confirmer.id],
  ] as const) {
    const done = await advanceStep({
      orderId: created.orderId,
      position,
      userId,
    });
    if (!done.ok) throw new Error(`${position}: ${done.reason}`);
  }
  return { ...seeded, orderId: created.orderId };
}

const turns = (userId: string) =>
  db.notification.findMany({
    where: { userId, kind: "ORDER" },
    select: { title: true },
  });

test(
  "nobody is told it is their move while the hold runs",
  withCleanDb(async () => {
    const { seller } = await inHold("SAFEST");
    // The seller's next step exists, but Google will not let them take it
    // for seven days: a "your move" now would be a lie.
    expect(
      (await turns(seller.id)).filter((t) =>
        t.title.startsWith("Make the agent primary owner"),
      ),
    ).toEqual([]);
  }),
);

test(
  "when Google's wait ends, the Safest seller is told once",
  withCleanDb(async () => {
    const { orderId, seller, listing } = await inHold("SAFEST");
    expect(await announceEndedHolds()).toBe(0);

    await passHold(orderId);
    expect(await announceEndedHolds()).toBe(1);
    expect(await announceEndedHolds()).toBe(0);

    expect(
      (await turns(seller.id)).filter((t) =>
        t.title.startsWith("Make the agent primary owner"),
      ),
    ).toHaveLength(1);
    const conversation = await db.conversation.findFirstOrThrow({
      where: { listingId: listing.id },
      select: { id: true },
    });
    const last = await db.message.findFirstOrThrow({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      select: { kind: true, body: true, senderId: true },
    });
    expect(last).toEqual({
      kind: "EVENT",
      body: "The waiting period is over. The next step is open",
      senderId: null,
    });
  }),
);

test(
  "when the holding period ends, the Fastest seller is told to make the buyer primary owner",
  withCleanDb(async () => {
    const { orderId, seller } = await inHold("FASTEST");
    await passHold(orderId);
    expect(await announceEndedHolds()).toBe(1);
    expect(
      (await turns(seller.id)).filter((t) =>
        t.title.startsWith("Make the buyer primary owner"),
      ),
    ).toHaveLength(1);
  }),
);

test(
  "a paused deal's hold ending tells nobody",
  withCleanDb(async () => {
    const { orderId, buyer } = await inHold("FASTEST");
    await resolveDeal({
      orderId,
      to: "DISPUTED",
      byUserId: buyer.id,
      note: "not what was listed",
    });
    await passHold(orderId);
    expect(await announceEndedHolds()).toBe(0);
  }),
);

test(
  "a step behind a running hold is not counted as anyone's move",
  withCleanDb(async () => {
    // The dashboard's "waiting on you" badge would otherwise stay lit for
    // the whole week on a step the seller cannot take.
    const { orderId, seller } = await inHold("FASTEST");
    expect(await countDealsAwaiting(seller.id)).toBe(0);
    const [row] = await listDealsFor(seller.id);
    expect(row).toMatchObject({ awaiting: "seller", openStep: 4 });
    expect(row.waitingUntil?.getTime()).toBeGreaterThan(Date.now());

    await passHold(orderId);
    expect(await countDealsAwaiting(seller.id)).toBe(1);
    expect((await listDealsFor(seller.id))[0].waitingUntil).toBeNull();
  }),
);
