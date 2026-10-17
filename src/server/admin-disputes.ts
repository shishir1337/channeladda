import "server-only";

import type { DealMode, OrderStatus, UserRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { recordAudit } from "@/server/audit";
import { noteFrom } from "@/server/deal-feed";
import { getSettings } from "@/server/settings";

/**
 * The dispute desk.
 *
 * A dispute is a deal in `DISPUTED`, and the record of it is the audit trail:
 * `resolveDeal` writes the raiser's note into the `deal.disputed` row, the
 * processor-refund webhook writes its own row when it freezes a deal, and
 * staff add to it from this desk. The `Dispute` table is modelled but nothing
 * has ever written to it, so building on it would mean every dispute already
 * open had no record at all. This reads the trail, which is where the record
 * actually is.
 *
 * Nothing here is scoped to a party, so every read is gated on a staff role —
 * here as well as on the page, because a function that hands out what both
 * sides of every frozen deal said must not depend on its caller remembering
 * to check.
 */

/** The desks that decide disputes. `AGENT` is deliberately not one of them. */
const DISPUTE_DESK: readonly UserRole[] = [
  "MODERATOR",
  "FINANCE",
  "SUPERADMIN",
];

export function canReadDisputes(role: UserRole): boolean {
  return DISPUTE_DESK.includes(role);
}

/** A note short enough to be "ok" is not a record anybody can decide from. */
export const MIN_DISPUTE_NOTE = 10;
export const MAX_DISPUTE_NOTE = 2_000;

/**
 * Who wrote a line of the record, relative to this deal.
 *
 * Worked out from the order rather than from the actor's role, because the
 * same person is a buyer on one deal and a seller on the next, and "buyer
 * said" is what a moderator needs to read.
 */
export type RecordSide =
  | "buyer"
  | "seller"
  | "agent"
  | "staff"
  /** The platform on its own: a processor refund, a sweep. */
  | "platform"
  /** Somebody with no part in the deal and no staff role now. */
  | "other";

export type RecordEntry = {
  id: string;
  action: string;
  at: Date;
  /** Null when the platform did this on its own. */
  actorName: string | null;
  side: RecordSide;
  /** What they wrote, if they wrote anything. */
  note: string | null;
};

export type DisputeStep = {
  position: number;
  label: string;
  actor: string;
  completedAt: Date | null;
  proofUrl: string | null;
};

type Person = { id: string; name: string; email: string };

export type DisputeCase = {
  orderId: string;
  reference: string;
  mode: DealMode;
  status: OrderStatus;
  openedAt: Date;
  /** Cents, as stored. */
  priceUsd: number;
  buyerFeeUsd: number;
  totalUsd: number;
  /**
   * What the platform's own ledger rows on this deal net to, in cents.
   *
   * Read from the books rather than inferred from the status, because the
   * status is the one thing a dispute erases: a disputed deal looks the same
   * whether we hold the full price or nothing at all.
   */
  heldUsd: number;
  /** The opening payment cleared (`paymentRef` is set). */
  paid: boolean;
  /** A Safest agent confirmed they own the channel (`custodyAt` is set). */
  inCustody: boolean;
  paidAt: Date | null;
  custodyAt: Date | null;
  /** Safest: the buyer says they paid the seller, with this reference. */
  buyerPaidAt: Date | null;
  buyerPaymentRef: string | null;
  /** Safest: the seller says that money arrived. */
  sellerConfirmedAt: Date | null;
  handoverAt: Date | null;
  /**
   * An unpaid dispute lapses on the payment-window clock like any unpaid
   * deal; this is when. Null once paid, because a paid one never lapses.
   */
  lapsesAt: Date | null;
  listing: {
    id: string;
    title: string;
    handle: string;
    slug: string;
    platform: string;
  };
  buyer: Person;
  /**
   * `whatsapp` is the number given on the listing. Staff-only: it was
   * collected so a stalled transfer can be unstuck by phoning the seller, and
   * this desk is where transfers stall.
   */
  seller: Person & { whatsapp: string | null };
  agent: Person | null;
  /** The order's own thread, which is what each side said to the other. */
  conversation: {
    id: string;
    messages: number;
    lastMessageAt: Date;
    flagged: boolean;
  } | null;
  /**
   * The row that froze the deal. Null when the trail has no such row — the
   * audit write is best effort — in which case the desk says so rather than
   * guessing who raised it.
   */
  raised: RecordEntry | null;
  /** When the clock on this dispute started. */
  waitingSince: Date;
  /** Everything written on this deal since it froze, oldest first. */
  since: RecordEntry[];
  steps: DisputeStep[];
};

/** A row that moved this deal into `DISPUTED`. */
function froze(row: { action: string; after: unknown }): boolean {
  if (row.action === "deal.disputed") return true;
  if (row.action !== "payment.refunded_by_processor") return false;
  // The webhook writes this row whether or not the deal could still be
  // frozen; only `frozen: true` means this is the moment it stopped.
  const after = row.after as { frozen?: unknown } | null;
  return after?.frozen === true;
}

function sideOf(
  actor: { id: string; role: UserRole } | null,
  order: { buyerId: string; sellerId: string; agentId: string | null },
): RecordSide {
  if (!actor) return "platform";
  if (actor.id === order.buyerId) return "buyer";
  if (actor.id === order.sellerId) return "seller";
  if (order.agentId && actor.id === order.agentId) return "agent";
  return DISPUTE_DESK.includes(actor.role) ? "staff" : "other";
}

/**
 * Every frozen deal, the one that has waited longest first.
 *
 * Returns null for anyone who is not on a dispute desk, the same way
 * `getDealFor` returns null for somebody who is not on the deal.
 */
export async function listDisputes(
  viewer: { role: UserRole },
  limit = 100,
): Promise<DisputeCase[] | null> {
  if (!canReadDisputes(viewer.role)) return null;

  const orders = await db.order.findMany({
    where: { status: "DISPUTED" },
    // The real order is by when each one froze, which needs the trail; this
    // only decides which hundred are read if there are ever more.
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: {
      id: true,
      reference: true,
      mode: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      priceUsd: true,
      buyerFeeUsd: true,
      totalUsd: true,
      paymentRef: true,
      paidAt: true,
      custodyAt: true,
      buyerPaidAt: true,
      buyerPaymentRef: true,
      sellerConfirmedAt: true,
      handoverAt: true,
      buyerId: true,
      sellerId: true,
      agentId: true,
      listing: {
        select: {
          id: true,
          title: true,
          handle: true,
          slug: true,
          platform: true,
          whatsapp: true,
        },
      },
      buyer: { select: { id: true, name: true, email: true } },
      seller: { select: { id: true, name: true, email: true } },
      agent: { select: { id: true, name: true, email: true } },
      conversation: {
        select: {
          id: true,
          lastMessageAt: true,
          flaggedAt: true,
          _count: { select: { messages: true } },
        },
      },
      steps: {
        orderBy: { position: "asc" },
        select: {
          position: true,
          label: true,
          actor: true,
          completedAt: true,
          proofUrl: true,
        },
      },
    },
  });
  if (orders.length === 0) return [];

  const ids = orders.map((o) => o.id);
  const [trail, books, settings] = await Promise.all([
    db.auditLog.findMany({
      where: { entity: "order", entityId: { in: ids } },
      // Two rows in the same millisecond still read in the order written.
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        action: true,
        createdAt: true,
        entityId: true,
        after: true,
        actor: { select: { id: true, name: true, role: true } },
      },
    }),
    db.ledgerEntry.groupBy({
      by: ["orderId"],
      // Rows with no user are the platform's own position.
      where: { orderId: { in: ids }, userId: null },
      _sum: { amountUsd: true },
    }),
    getSettings(),
  ]);

  const rowsFor = new Map<string, typeof trail>();
  for (const row of trail) {
    const list = rowsFor.get(row.entityId) ?? [];
    list.push(row);
    rowsFor.set(row.entityId, list);
  }
  const heldFor = new Map(
    books.map((g) => [g.orderId, g._sum.amountUsd ?? 0] as const),
  );
  const windowMs = settings.paymentWindowHours * 60 * 60 * 1000;

  const cases = orders.map((order): DisputeCase => {
    const rows = rowsFor.get(order.id) ?? [];
    const entry = (row: (typeof rows)[number]): RecordEntry => ({
      id: row.id,
      action: row.action,
      at: row.createdAt,
      actorName: row.actor?.name ?? null,
      side: sideOf(row.actor, order),
      note: noteFrom(row.after),
    });

    // The first freeze, not the last. A processor refund landing on a deal a
    // person had already disputed writes a second freezing row, and taking
    // that one would bury the buyer's or seller's own words under it.
    const at = rows.findIndex(froze);
    const raised = at === -1 ? null : entry(rows[at]);
    const since = at === -1 ? [] : rows.slice(at + 1).map(entry);
    const paid = order.paymentRef !== null;

    return {
      orderId: order.id,
      reference: order.reference,
      mode: order.mode,
      status: order.status,
      openedAt: order.createdAt,
      priceUsd: order.priceUsd,
      buyerFeeUsd: order.buyerFeeUsd,
      totalUsd: order.totalUsd,
      heldUsd: heldFor.get(order.id) ?? 0,
      paid,
      inCustody: order.custodyAt !== null,
      paidAt: order.paidAt,
      custodyAt: order.custodyAt,
      buyerPaidAt: order.buyerPaidAt,
      buyerPaymentRef: order.buyerPaymentRef,
      sellerConfirmedAt: order.sellerConfirmedAt,
      handoverAt: order.handoverAt,
      lapsesAt: paid ? null : new Date(order.createdAt.getTime() + windowMs),
      listing: {
        id: order.listing.id,
        title: order.listing.title,
        handle: order.listing.handle,
        slug: order.listing.slug,
        platform: order.listing.platform.toLowerCase(),
      },
      buyer: order.buyer,
      seller: { ...order.seller, whatsapp: order.listing.whatsapp },
      agent: order.agent,
      conversation: order.conversation
        ? {
            id: order.conversation.id,
            messages: order.conversation._count.messages,
            lastMessageAt: order.conversation.lastMessageAt,
            flagged: order.conversation.flaggedAt !== null,
          }
        : null,
      raised,
      // Without a freezing row the last write to the order is the best
      // remaining guess, and a dispute freezes every write but the decision.
      waitingSince: raised?.at ?? order.updatedAt,
      since,
      steps: order.steps,
    };
  });

  return cases.sort(
    (a, b) => a.waitingSince.getTime() - b.waitingSince.getTime(),
  );
}

/** For the nav badge: disputes are waiting on staff by definition. */
export async function countOpenDisputes(): Promise<number> {
  return db.order.count({ where: { status: "DISPUTED" } });
}

export type DisputeNoteFailure =
  | "too-short"
  | "too-long"
  | "not-staff"
  | "not-found"
  | "not-disputed";

/**
 * Putting something on the record of a frozen deal.
 *
 * Only one side gets to write when a dispute is raised — the other cannot
 * raise one on a deal that is already disputed — so the other side's account
 * reaches a moderator by chat or by phone, and this is where it gets written
 * down: "Seller, by WhatsApp: says the buyer never accepted the invite".
 * The decision is then taken from a record that has both sides on it.
 *
 * Staff only, and only while the deal is still disputed: a note added after
 * the decision is not part of what it was decided from.
 */
export async function addDisputeNote(input: {
  orderId: string;
  byUserId: string;
  note: string;
}): Promise<{ ok: true } | { ok: false; reason: DisputeNoteFailure }> {
  const note = input.note.trim();
  if (note.length < MIN_DISPUTE_NOTE) return { ok: false, reason: "too-short" };
  if (note.length > MAX_DISPUTE_NOTE) return { ok: false, reason: "too-long" };

  const [author, order] = await Promise.all([
    db.user.findUnique({
      where: { id: input.byUserId },
      select: { role: true, bannedAt: true },
    }),
    db.order.findUnique({
      where: { id: input.orderId },
      select: { id: true, status: true },
    }),
  ]);

  if (!author || author.bannedAt || !canReadDisputes(author.role)) {
    return { ok: false, reason: "not-staff" };
  }
  if (!order) return { ok: false, reason: "not-found" };
  if (order.status !== "DISPUTED") return { ok: false, reason: "not-disputed" };

  await recordAudit({
    actorId: input.byUserId,
    action: "deal.dispute_note",
    entity: "order",
    entityId: order.id,
    after: { note, status: order.status },
  });

  return { ok: true };
}
