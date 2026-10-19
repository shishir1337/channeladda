import { afterEach, expect, test, vi } from "vitest";
import type { DealMode } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { templateFor } from "@/lib/deal-templates";
import { seedListing, withCleanDb } from "@/test/db";

// The client's ask: the buyer says which of their accounts receives
// ownership before they pay, and the seller is emailed it once the payment
// clears, so on a Fastest deal they know exactly whom to promote.

const mail = vi.hoisted(() => ({
  sent: [] as { to: string; subject: string; body: string }[],
}));
const fake = vi.hoisted(() => ({ userId: "" }));

vi.mock("@/server/mailer", () => ({
  canSendMail: () => true,
  sendMail: async (m: { to: string; subject: string; body: string }) => {
    mail.sent.push(m);
  },
}));
vi.mock("@/server/session", () => ({
  requireUser: async () => ({
    id: fake.userId,
    role: "USER",
    emailVerified: true,
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

afterEach(() => {
  mail.sent.length = 0;
});

async function opened(mode: DealMode, handoverTo = "buyer.owner@gmail.com") {
  const seeded = await seedListing();
  const { createDeal } = await import("@/server/deals");
  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode,
    acceptedRevenueRisk: true,
    handoverTo,
  });
  if (!created.ok) throw new Error(created.reason);
  return { ...seeded, orderId: created.orderId };
}

async function pay(orderId: string) {
  const { recordOpeningPayment } = await import("@/server/deals");
  await recordOpeningPayment(orderId, `pay-${orderId}`, "USDT");
}

// ------------------------------------------------------------ asking for it

test(
  "a deal cannot be started without the account that receives ownership",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    fake.userId = buyer.id;
    const { startDeal } = await import("@/server/actions/deals");

    const result = await startDeal(listing.id, "FASTEST", true, "   ");
    expect(result).toMatchObject({
      ok: false,
      error: "Enter the Google account email that should become owner.",
    });
    expect(await db.order.count()).toBe(0);
  }),
);

test(
  "the account is checked against the platform and stored as written to us",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    fake.userId = buyer.id;
    const { startDeal } = await import("@/server/actions/deals");

    const result = await startDeal(
      listing.id,
      "FASTEST",
      true,
      " New.Owner@Gmail.com ",
    );
    expect(result.ok).toBe(true);
    const order = await db.order.findFirstOrThrow({
      select: { handoverTo: true },
    });
    expect(order.handoverTo).toBe("new.owner@gmail.com");
  }),
);

// ---------------------------------------------------------- telling them

test(
  "once a Fastest payment clears, the seller is emailed whom to make owner",
  withCleanDb(async () => {
    const { orderId, seller } = await opened("FASTEST");
    await pay(orderId);

    const toSeller = mail.sent.filter((m) => m.to === seller.email);
    expect(toSeller).toHaveLength(1);
    expect(toSeller[0]?.body).toContain(
      "Give ownership to this account: buyer.owner@gmail.com",
    );
  }),
);

test(
  "a Safest seller hands the channel to our agent, never to the buyer, so is not told it",
  withCleanDb(async () => {
    const { orderId, seller } = await opened("SAFEST");
    await pay(orderId);

    const toSeller = mail.sent.filter((m) => m.to === seller.email);
    expect(toSeller.length).toBeGreaterThan(0);
    for (const m of toSeller) {
      expect(m.body).not.toContain("buyer.owner@gmail.com");
    }
  }),
);

// ----------------------------------------------------------- who can see it

test(
  "the deal view shows it to the people who transfer, and hides it from a Safest seller",
  withCleanDb(async () => {
    const { getDealFor } = await import("@/server/deals");

    const fastest = await opened("FASTEST");
    expect(
      (await getDealFor(fastest.seller.id, fastest.orderId))?.handoverTo,
    ).toBe("buyer.owner@gmail.com");
    expect(
      (await getDealFor(fastest.buyer.id, fastest.orderId))?.handoverTo,
    ).toBe("buyer.owner@gmail.com");

    const safest = await opened("SAFEST");
    expect(
      (await getDealFor(safest.seller.id, safest.orderId))?.handoverTo,
    ).toBeNull();
  }),
);

// ------------------------------------------------------------ correcting it

test(
  "the buyer can correct it until ownership has been handed over, and the seller hears",
  withCleanDb(async () => {
    const { orderId, buyer, seller } = await opened("FASTEST");
    await pay(orderId);
    mail.sent.length = 0;
    const { updateHandoverTo } = await import("@/server/deals");

    expect(
      await updateHandoverTo({
        orderId,
        byUserId: buyer.id,
        raw: "fixed.typo@gmail.com",
      }),
    ).toEqual({ ok: true });
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: orderId } })).handoverTo,
    ).toBe("fixed.typo@gmail.com");
    expect(
      mail.sent.some(
        (m) => m.to === seller.email && m.body.includes("fixed.typo@gmail.com"),
      ),
    ).toBe(true);

    // The seller adding the buyer as manager is the step that uses it.
    // After that, a change would only point somewhere the channel is not.
    const uses = templateFor("FASTEST").find((s) => s.usesHandover);
    await db.transferStep.updateMany({
      where: { orderId, position: { lte: uses?.position ?? 0 } },
      data: { completedAt: new Date() },
    });
    expect(
      await updateHandoverTo({
        orderId,
        byUserId: buyer.id,
        raw: "too.late@gmail.com",
      }),
    ).toEqual({ ok: false, reason: "handed-over" });
  }),
);

test(
  "it can no longer change once it is used, but stays in view until the handover",
  withCleanDb(async () => {
    // Fastest uses the account twice: the seller adds it as manager, then
    // after the holding period makes it primary owner. Locked from the
    // first, it must still be on the seller's screen for the second.
    const { orderId, buyer, seller } = await opened("FASTEST");
    await pay(orderId);
    const { getDealFor } = await import("@/server/deals");
    const done = async (upTo: number) =>
      db.transferStep.updateMany({
        where: { orderId, position: { lte: upTo } },
        data: { completedAt: new Date() },
      });

    await done(2);
    const added = await getDealFor(seller.id, orderId);
    expect(added).toMatchObject({ handoverOpen: false, handoverInUse: true });
    expect(added?.handoverTo).toBe("buyer.owner@gmail.com");

    await done(4);
    expect(await getDealFor(buyer.id, orderId)).toMatchObject({
      handoverOpen: false,
      handoverInUse: false,
    });
  }),
);

test(
  "only the buyer can change it, and only to something valid",
  withCleanDb(async () => {
    const { orderId, seller, buyer } = await opened("FASTEST");
    const { updateHandoverTo } = await import("@/server/deals");

    expect(
      await updateHandoverTo({
        orderId,
        byUserId: seller.id,
        raw: "seller.own@gmail.com",
      }),
    ).toEqual({ ok: false, reason: "wrong-actor" });
    expect(
      await updateHandoverTo({ orderId, byUserId: buyer.id, raw: "nope" }),
    ).toEqual({ ok: false, reason: "bad-handover" });
  }),
);
