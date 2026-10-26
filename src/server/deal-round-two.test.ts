import { expect, test, vi } from "vitest";
import type { Platform, UserRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import {
  countDealsAwaiting,
  createDeal,
  getDealFor,
  listDealsFor,
  recordOpeningPayment,
  resolveDeal,
} from "@/server/deals";
import type { CurrentUser } from "@/server/session";
import { seedListing, seedUser, withCleanDb } from "@/test/db";
import { runStep } from "@/test/deal-steps";

/**
 * The deal fixes from the regression run of 2026-10-26, round 2: each
 * platform's transfer identity, whose move a Safest deal is while the
 * seller has not said where to be paid, the chat's lines read from the
 * reader's side, and what the endings tell each person.
 */

const fake = vi.hoisted(() => ({ userId: "", role: "USER" as UserRole }));

vi.mock("@/server/session", () => ({
  requireRole: async (...allowed: UserRole[]) => {
    if (fake.role !== "SUPERADMIN" && !allowed.includes(fake.role)) {
      throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    }
    return { id: fake.userId, role: fake.role };
  },
  requireSuperadmin: async () => {
    if (fake.role !== "SUPERADMIN") {
      throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    }
    return { id: fake.userId, role: fake.role };
  },
  requireStaff: async () => ({ id: fake.userId, role: fake.role }),
  requireUser: async () => ({ id: fake.userId, role: fake.role }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const HANDOVER: Record<Platform, string> = {
  YOUTUBE: "buyer@gmail.test",
  INSTAGRAM: "buyer@example.test",
  WEBSITE: "buyer@example.test",
  FACEBOOK: "buyer@example.test",
  TELEGRAM: "@buyer_name",
};

async function open(
  mode: "SAFEST" | "FASTEST",
  platform: Platform,
  options: { agentIdentity?: boolean } = {},
) {
  const s = await seedListing();
  await db.listing.update({
    where: { id: s.listing.id },
    data: { platform },
  });
  const created = await createDeal({
    listingId: s.listing.id,
    buyerId: s.buyer.id,
    mode,
    acceptedRevenueRisk: true,
    handoverTo: HANDOVER[platform],
  });
  if (!created.ok) throw new Error(created.reason);
  await recordOpeningPayment(created.orderId, `pay-${created.orderId}`, "USDT");
  if (options.agentIdentity !== false) {
    await db.order.update({
      where: { id: created.orderId },
      data: {
        agentId: s.agent.id,
        agentEmail: platform === "TELEGRAM" ? "@ca_transfers" : "t@ca.test",
        agentBrand: "Channel Adda Transfers",
      },
    });
  }
  return { ...s, orderId: created.orderId };
}

async function step(orderId: string, position: number, userId: string) {
  const done = await runStep({ orderId, position, userId });
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

// ------------------------------------------------- the transfer identity

test(
  "a Telegram deal is handed to the agent's Telegram username, never their email",
  withCleanDb(async () => {
    // QA, CA-87042: "Make this account an admin: transfers@channeladda.test".
    const t = await open("FASTEST", "TELEGRAM", { agentIdentity: false });
    fake.userId = t.agent.id;
    fake.role = "AGENT";
    const { setMyAgentIdentity } = await import("@/server/actions/admin-users");
    const { claimDeal } = await import("@/server/actions/deals");

    expect(
      await setMyAgentIdentity("transfers@channeladda.test", "Channel Adda"),
    ).toMatchObject({ ok: true });
    // An email alone is nothing a Telegram seller can make an admin.
    expect(await claimDeal(t.orderId)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Telegram username.*Security page/),
    });

    expect(
      await setMyAgentIdentity("transfers@channeladda.test", "Channel Adda", {
        telegram: "t.me/CA_Transfers",
        facebook: "",
      }),
    ).toMatchObject({ ok: true });
    expect(await claimDeal(t.orderId)).toMatchObject({ ok: true });
    const order = await db.order.findUniqueOrThrow({
      where: { id: t.orderId },
    });
    expect(order.agentEmail).toBe("@CA_Transfers");
  }),
);

test(
  "staff cannot give a Telegram deal to an agent with no Telegram username",
  withCleanDb(async () => {
    const t = await open("FASTEST", "TELEGRAM", { agentIdentity: false });
    await db.user.update({
      where: { id: t.agent.id },
      data: { agentEmail: "t@ca.test", agentBrand: "Channel Adda" },
    });
    const moderator = await seedUser("MODERATOR");
    fake.userId = moderator.id;
    fake.role = "MODERATOR";
    const { assignDealAgent } = await import("@/server/actions/deals");
    expect(await assignDealAgent(t.orderId, t.agent.id)).toMatchObject({
      ok: false,
      error: expect.stringMatching(
        /Test Agent's .*Telegram username.*Team page/,
      ),
    });
  }),
);

test(
  "a sign-in email is refused as a transfer identity, and so is a bad username",
  withCleanDb(async () => {
    // QA: demo-admin@example.test was saved as the identity.
    const agent = await seedUser("AGENT");
    const admin = await seedUser("SUPERADMIN");
    fake.userId = agent.id;
    fake.role = "AGENT";
    const { setMyAgentIdentity } = await import("@/server/actions/admin-users");
    expect(
      await setMyAgentIdentity(admin.email.toUpperCase(), "Channel Adda"),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/sign-in/) });
    expect(
      await setMyAgentIdentity("", "Channel Adda", {
        telegram: "",
        facebook: agent.email,
      }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/sign-in/) });
    expect(
      await setMyAgentIdentity("t@ca.test", "Channel Adda", {
        telegram: "@ab",
        facebook: "",
      }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/5 to 32/) });
    const row = await db.user.findUniqueOrThrow({ where: { id: agent.id } });
    expect(row.agentEmail).toBeNull();
    expect(row.agentTelegram).toBeNull();
  }),
);

// ------------------------------------------- whose move, with no details

test(
  "with no payment details, paying the seller is the seller's move everywhere",
  withCleanDb(async () => {
    // QA, CA-27058: the buyer was told "Pay the seller now" and "Your
    // move", and the seller "You are all caught up".
    const t = await open("SAFEST", "INSTAGRAM");
    await step(t.orderId, 2, t.seller.id);
    await step(t.orderId, 3, t.agent.id);
    await step(t.orderId, 4, t.seller.id);
    await step(t.orderId, 5, t.agent.id);

    const buyerView = await getDealFor(t.buyer.id, t.orderId);
    const sellerView = await getDealFor(t.seller.id, t.orderId);
    expect(buyerView?.turn).toEqual({
      kind: "move",
      actor: "seller",
      payTo: true,
    });
    expect(sellerView?.payToMissing).toBe(true);

    const [buyerRow] = await listDealsFor(t.buyer.id);
    const [sellerRow] = await listDealsFor(t.seller.id);
    expect(buyerRow.awaiting).toBe("seller");
    expect(sellerRow.awaiting).toBe("seller");
    expect(await countDealsAwaiting(t.buyer.id)).toBe(0);
    expect(await countDealsAwaiting(t.seller.id)).toBe(1);

    // The seller is asked; the buyer is not told to pay nobody.
    expect((await bodies(t.seller.id)).join("\n")).toMatch(
      /add where to be paid \| Our agent has checked the account/,
    );
    expect((await bodies(t.buyer.id)).join("\n")).not.toMatch(/Pay the seller/);

    // Once the seller says where, it is the buyer's move.
    await db.order.update({
      where: { id: t.orderId },
      data: { sellerPayTo: "bKash 01700000000" },
    });
    expect((await getDealFor(t.buyer.id, t.orderId))?.turn).toEqual({
      kind: "move",
      actor: "buyer",
      payTo: false,
    });
    expect(await countDealsAwaiting(t.buyer.id)).toBe(1);
  }),
);

// ------------------------------------------- the chat, from each side

test(
  "the deal chat reads its lines from the reader's side",
  withCleanDb(async () => {
    // QA, CA-87042: the buyer read "Imran Hossain made the buyer an admin".
    const t = await open("FASTEST", "TELEGRAM");
    await step(t.orderId, 2, t.seller.id);
    await step(t.orderId, 3, t.agent.id);
    const order = await db.order.findUniqueOrThrow({
      where: { id: t.orderId },
    });
    if (!order.conversationId) throw new Error("no conversation");
    const { getThread } = await import("@/server/messages");
    const as = (user: { id: string }, role: UserRole = "USER") =>
      ({ id: user.id, role }) as CurrentUser;

    const buyer = await getThread(order.conversationId, as(t.buyer));
    const bodiesOf = (thread: typeof buyer) =>
      (thread?.messages ?? []).map((message) => message.body);
    expect(bodiesOf(buyer)).toContain("Test Agent made you an admin");
    const seller = await getThread(order.conversationId, as(t.seller));
    expect(bodiesOf(seller)).toContain("Test Agent made the buyer an admin");
  }),
);

// ------------------------------------------- what the endings say

test(
  "a cancelled deal tells the buyer about their own money, the reason quoted once",
  withCleanDb(async () => {
    // QA, CA-50979: "Their reason: “…safely.”." and "Everything the buyer
    // paid is back in their Channel Adda balance", to the buyer.
    const t = await open("FASTEST", "INSTAGRAM");
    expect(
      await resolveDeal({
        orderId: t.orderId,
        to: "CANCELLED",
        byUserId: t.seller.id,
        note: "I cannot hand it over safely.",
      }),
    ).toMatchObject({ ok: true });
    const buyer = (await bodies(t.buyer.id)).join("\n");
    expect(buyer).toMatch(/Their reason: “I cannot hand it over safely\.” /);
    expect(buyer).not.toMatch(/safely\.”\./);
    expect(buyer).toMatch(
      /Everything you paid is back in your Channel Adda balance/,
    );
    expect((await bodies(t.agent.id)).join("\n")).toMatch(
      /Everything the buyer paid is back in their/,
    );
    const view = await getDealFor(t.seller.id, t.orderId);
    expect(view?.endedLine).toBe(
      "You cancelled this deal. Your reason: “I cannot hand it over safely.”",
    );
  }),
);

test(
  "a refund says how much, and a dispute shows its reason on the deal",
  withCleanDb(async () => {
    const t = await open("FASTEST", "FACEBOOK");
    await resolveDeal({
      orderId: t.orderId,
      to: "DISPUTED",
      byUserId: t.buyer.id,
      note: "The Page is a different one. Call me on 01712345678.",
    });
    const seller = await getDealFor(t.seller.id, t.orderId);
    expect(seller?.disputeLine).toMatch(
      /^Test Buyer raised it: “The Page is a different one\./,
    );
    expect(seller?.disputeLine).not.toMatch(/01712345678/);
    expect((await getDealFor(t.buyer.id, t.orderId))?.disputeLine).toMatch(
      /^You raised it/,
    );

    const finance = await seedUser("FINANCE");
    expect(
      await resolveDeal({
        orderId: t.orderId,
        to: "REFUNDED",
        byUserId: finance.id,
        note: "wrong Page",
      }),
    ).toMatchObject({ ok: true });
    // $100 and the 3% fee.
    expect((await bodies(t.buyer.id)).join("\n")).toMatch(
      /Buyer refunded — CA-\d+ \| \$103\.00 is back in your Channel Adda balance/,
    );
    expect((await bodies(t.seller.id)).join("\n")).toMatch(
      /The buyer was refunded \$103\.00/,
    );
  }),
);

test(
  "a finished deal reads as finished, in the platform's word",
  withCleanDb(async () => {
    // QA, round 2: "Completed … has closed", as a cancelled deal says it.
    const t = await open("FASTEST", "TELEGRAM");
    await step(t.orderId, 2, t.seller.id);
    await step(t.orderId, 3, t.agent.id);
    await step(t.orderId, 4, t.seller.id);
    await step(t.orderId, 5, t.agent.id);
    await step(t.orderId, 6, t.agent.id);
    const buyer = (await bodies(t.buyer.id)).join("\n");
    expect(buyer).toMatch(/Deal complete — CA-\d+ \| The channel is yours now/);
    expect(buyer).not.toMatch(/Deal complete[^\n]*has closed/);
    expect((await bodies(t.seller.id)).join("\n")).toMatch(
      /The channel is Test Buyer's now, and your money is in your Channel Adda wallet/,
    );
  }),
);
