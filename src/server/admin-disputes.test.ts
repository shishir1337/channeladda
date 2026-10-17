import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { addDisputeNote, listDisputes } from "@/server/admin-disputes";
import { recordAudit } from "@/server/audit";
import { listDealActivity } from "@/server/deal-feed";
import { createDeal, recordOpeningPayment, resolveDeal } from "@/server/deals";
import { openConversation } from "@/server/messages";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

const RAISED =
  "The seller stopped answering the day after I paid the admin fee.";

/**
 * A paid Safest deal on a $100 listing, disputed by the buyer, with the
 * conversation the buyer opened beforehand linked to it.
 */
async function disputedDeal(
  options: { mode?: "SAFEST" | "FASTEST"; pay?: boolean } = {},
) {
  const seeded = await seedListing();
  const opened = await openConversation({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
  });
  if (!opened.ok) throw new Error(opened.reason);

  const created = await createDeal({
    listingId: seeded.listing.id,
    buyerId: seeded.buyer.id,
    mode: options.mode ?? "SAFEST",
    acceptedRevenueRisk: true,
  });
  if (!created.ok) throw new Error(created.reason);
  const { orderId } = created;

  if (options.pay ?? true) {
    await recordOpeningPayment(orderId, `pay-${orderId}`, "USDT");
  }

  const raised = await resolveDeal({
    orderId,
    to: "DISPUTED",
    byUserId: seeded.buyer.id,
    note: RAISED,
  });
  if (!raised.ok) throw new Error(raised.reason);

  return { ...seeded, orderId, conversationId: opened.id };
}

test(
  "the desk shows who raised a dispute, what they said, and every later note in order",
  withCleanDb(async () => {
    const { orderId, buyer, seller, listing, conversationId } =
      await disputedDeal();
    await db.listing.update({
      where: { id: listing.id },
      data: { whatsapp: "+880 1712-345678" },
    });
    const moderator = await seedUser("MODERATOR");
    const finance = await seedUser("FINANCE");

    const sellerSide =
      "Seller, by WhatsApp: says the owner invite went out on Monday.";
    const books = "Checked the ledger: we hold the admin fee and nothing else.";
    expect(
      await addDisputeNote({
        orderId,
        byUserId: moderator.id,
        note: sellerSide,
      }),
    ).toEqual({ ok: true });
    expect(
      await addDisputeNote({ orderId, byUserId: finance.id, note: books }),
    ).toEqual({ ok: true });

    const desk = await listDisputes({ role: "MODERATOR" });
    expect(desk).toHaveLength(1);
    const [dispute] = desk ?? [];

    expect(dispute.orderId).toBe(orderId);
    expect(dispute.status).toBe("DISPUTED");
    expect(dispute.mode).toBe("SAFEST");
    expect(dispute.raised).toMatchObject({
      action: "deal.disputed",
      side: "buyer",
      actorName: buyer.name,
      note: RAISED,
    });
    expect(dispute.waitingSince).toEqual(dispute.raised?.at);

    // Oldest first, each with who wrote it.
    expect(
      dispute.since.map((e) => [e.action, e.side, e.actorName, e.note]),
    ).toEqual([
      ["deal.dispute_note", "staff", moderator.name, sellerSide],
      ["deal.dispute_note", "staff", finance.name, books],
    ]);

    // The position, from the order and from the books.
    expect(dispute.paid).toBe(true);
    expect(dispute.inCustody).toBe(false);
    // Safest: the 3% admin fee on $100, and nothing of the price.
    expect(dispute.heldUsd).toBe(300);
    expect(dispute.lapsesAt).toBeNull();

    // Somewhere to read what they said to each other, and someone to call.
    expect(dispute.conversation?.id).toBe(conversationId);
    expect(dispute.seller).toMatchObject({
      id: seller.id,
      whatsapp: "+880 1712-345678",
    });
    expect(dispute.steps.length).toBeGreaterThan(0);
    expect(dispute.steps[0].completedAt).not.toBeNull();
  }),
);

test(
  "an agent cannot read the desk or write on it",
  withCleanDb(async () => {
    const { orderId, agent } = await disputedDeal();

    expect(await listDisputes({ role: "AGENT" })).toBeNull();
    expect(await listDisputes({ role: "USER" })).toBeNull();
    // Every staff desk can.
    for (const role of ["MODERATOR", "FINANCE", "SUPERADMIN"] as const) {
      expect(await listDisputes({ role })).toHaveLength(1);
    }

    expect(
      await addDisputeNote({
        orderId,
        byUserId: agent.id,
        note: "Writing on a record I am not allowed to read.",
      }),
    ).toEqual({ ok: false, reason: "not-staff" });
    expect(
      await db.auditLog.count({ where: { action: "deal.dispute_note" } }),
    ).toBe(0);
  }),
);

test(
  "a note that says nothing is refused, and so is one after the decision",
  withCleanDb(async () => {
    const { orderId } = await disputedDeal();
    const moderator = await seedUser("MODERATOR");

    expect(
      await addDisputeNote({ orderId, byUserId: moderator.id, note: "  ok  " }),
    ).toEqual({ ok: false, reason: "too-short" });

    // Safest, paid, no custody: cancelling is a moderator's call.
    const decided = await resolveDeal({
      orderId,
      to: "CANCELLED",
      byUserId: moderator.id,
      note: "Seller never invited the agent; nothing changed hands.",
    });
    expect(decided).toEqual({ ok: true });

    expect(await listDisputes({ role: "MODERATOR" })).toEqual([]);
    expect(
      await addDisputeNote({
        orderId,
        byUserId: moderator.id,
        note: "Something remembered after the deal was decided.",
      }),
    ).toEqual({ ok: false, reason: "not-disputed" });
  }),
);

test(
  "the longest wait comes first, by when it froze rather than when it opened",
  withCleanDb(async () => {
    const first = await disputedDeal();
    const second = await disputedDeal();

    // The second deal was opened later, but froze a day earlier.
    await db.auditLog.updateMany({
      where: { entityId: second.orderId, action: "deal.disputed" },
      data: { createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    const desk = await listDisputes({ role: "FINANCE" });
    expect(desk?.map((d) => d.orderId)).toEqual([
      second.orderId,
      first.orderId,
    ]);
  }),
);

test(
  "a processor refund on an already-disputed deal does not bury what the buyer said",
  withCleanDb(async () => {
    const { orderId } = await disputedDeal({ mode: "FASTEST" });

    // What the webhook writes when it freezes a deal.
    await recordAudit({
      actorId: null,
      action: "payment.refunded_by_processor",
      entity: "order",
      entityId: orderId,
      after: { reference: "CA-1", status: "refund_paid", frozen: true },
    });

    const [dispute] = (await listDisputes({ role: "MODERATOR" })) ?? [];
    expect(dispute.raised).toMatchObject({ side: "buyer", note: RAISED });
    expect(dispute.since.map((e) => [e.action, e.side, e.actorName])).toEqual([
      ["payment.refunded_by_processor", "platform", null],
    ]);
    // Fastest: we hold the price and the fee.
    expect(dispute.heldUsd).toBe(dispute.totalUsd);
  }),
);

test(
  "a deal the processor froze on its own is on the desk, raised by nobody",
  withCleanDb(async () => {
    const seeded = await seedListing();
    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "FASTEST",
      acceptedRevenueRisk: true,
    });
    if (!created.ok) throw new Error(created.reason);
    await recordOpeningPayment(created.orderId, "pay-x", "USDT");

    await db.order.update({
      where: { id: created.orderId },
      data: { status: "DISPUTED" },
    });
    await recordAudit({
      actorId: null,
      action: "payment.refunded_by_processor",
      entity: "order",
      entityId: created.orderId,
      after: { reference: "CA-2", status: "refund_paid", frozen: true },
    });

    const [dispute] = (await listDisputes({ role: "MODERATOR" })) ?? [];
    expect(dispute.raised).toMatchObject({
      action: "payment.refunded_by_processor",
      side: "platform",
      actorName: null,
      note: null,
    });
    // Nobody wrote to anybody, but every deal has a conversation now — the
    // one opening the deal made — so the desk always has somewhere to read
    // what happened, if only the deal's own lines.
    expect(dispute.conversation?.messages).toBeGreaterThan(0);
  }),
);

test(
  "an unpaid dispute says when it lapses and that we hold nothing",
  withCleanDb(async () => {
    const { orderId } = await disputedDeal({ pay: false });
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });

    const [dispute] = (await listDisputes({ role: "MODERATOR" })) ?? [];
    expect(dispute.paid).toBe(false);
    expect(dispute.heldUsd).toBe(0);
    // The test settings' 48-hour payment window.
    expect(dispute.lapsesAt).toEqual(
      new Date(order.createdAt.getTime() + 48 * 60 * 60 * 1000),
    );
  }),
);

test(
  "the deal feed carries the note a dispute was raised with",
  withCleanDb(async () => {
    const { orderId } = await disputedDeal();

    const rows = await listDealActivity();
    const raised = rows.find(
      (r) => r.orderId === orderId && r.action === "deal.disputed",
    );
    expect(raised?.note).toBe(RAISED);
    // Rows nobody typed anything on say so, rather than inventing a note.
    const opened = rows.find(
      (r) => r.orderId === orderId && r.action === "deal.created",
    );
    expect(opened?.note).toBeNull();
  }),
);
