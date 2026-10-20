import { afterEach, expect, test, vi } from "vitest";
import type { DealMode } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { templateFor } from "@/lib/deal-templates";
import { seedListing, withCleanDb } from "@/test/db";

// The client's ask: the buyer says which of their accounts receives
// ownership before they pay. Our agent invites it and hands the channel to
// it, in both modes, so our agent is the one told it — the seller never is.

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

/** With our agent on the deal, as staff assign one once it is paid. */
async function withAgent(orderId: string, agentId: string) {
  await db.order.update({
    where: { id: orderId },
    data: {
      agentId,
      agentEmail: "transfers@channeladda.test",
      agentBrand: "Channel Adda Transfers",
    },
  });
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
  "on a Fastest deal our agent is emailed the account at the step that invites it",
  withCleanDb(async () => {
    const { orderId, seller, agent } = await opened("FASTEST");
    await withAgent(orderId, agent.id);
    await pay(orderId);
    const { advanceStep } = await import("@/server/deals");
    const invited = await advanceStep({
      orderId,
      position: 2,
      userId: seller.id,
    });
    expect(invited).toEqual({ ok: true });

    const toAgent = mail.sent.filter((m) => m.to === agent.email);
    expect(toAgent).toHaveLength(1);
    // Their step is inviting it, so that is what it says.
    expect(toAgent[0]?.body).toContain(
      "Invite this account as an owner: buyer.owner@gmail.com",
    );
    expect(toAgent[0]?.body).not.toContain("Give ownership");
  }),
);

test.each(["SAFEST", "FASTEST"] as const)(
  "a %s seller hands the channel to our agent, never to the buyer, so is not told it",
  (mode) =>
    withCleanDb(async () => {
      const { orderId, seller, agent } = await opened(mode);
      await withAgent(orderId, agent.id);
      await pay(orderId);

      const toSeller = mail.sent.filter((m) => m.to === seller.email);
      expect(toSeller.length).toBeGreaterThan(0);
      for (const m of toSeller) {
        expect(m.body).not.toContain("buyer.owner@gmail.com");
      }
    })(),
);

// ----------------------------------------------------------- who can see it

test(
  "the deal view shows it to the buyer and our agent, and hides it from the seller",
  withCleanDb(async () => {
    const { getDealFor } = await import("@/server/deals");

    for (const mode of ["FASTEST", "SAFEST"] as const) {
      const deal = await opened(mode);
      await withAgent(deal.orderId, deal.agent.id);
      expect(
        (await getDealFor(deal.seller.id, deal.orderId))?.handoverTo,
      ).toBeNull();
      expect((await getDealFor(deal.buyer.id, deal.orderId))?.handoverTo).toBe(
        "buyer.owner@gmail.com",
      );
      expect((await getDealFor(deal.agent.id, deal.orderId))?.handoverTo).toBe(
        "buyer.owner@gmail.com",
      );
    }
  }),
);

// ------------------------------------------------------------ correcting it

test(
  "the buyer can correct it until our agent has used it, and our agent hears",
  withCleanDb(async () => {
    const { orderId, buyer, agent } = await opened("FASTEST");
    await withAgent(orderId, agent.id);
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
        (m) => m.to === agent.email && m.body.includes("fixed.typo@gmail.com"),
      ),
    ).toBe(true);

    // Our agent inviting the buyer is the step that uses it. After that, a
    // change would only point somewhere the channel is not.
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
    // Fastest uses the account twice: our agent invites it, then after the
    // holding period makes it primary owner. Locked from the first, it must
    // still be on our agent's screen for the second.
    const { orderId, buyer, agent } = await opened("FASTEST");
    await withAgent(orderId, agent.id);
    await pay(orderId);
    const { getDealFor } = await import("@/server/deals");
    const done = async (upTo: number) =>
      db.transferStep.updateMany({
        where: { orderId, position: { lte: upTo } },
        data: { completedAt: new Date() },
      });

    await done(3);
    const invited = await getDealFor(agent.id, orderId);
    expect(invited).toMatchObject({ handoverOpen: false, handoverInUse: true });
    expect(invited?.handoverTo).toBe("buyer.owner@gmail.com");

    await done(6);
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
