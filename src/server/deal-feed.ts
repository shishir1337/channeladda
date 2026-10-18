import "server-only";

import type { OrderStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { DealActor } from "@/lib/deal-machine";

/**
 * Everything that has happened to every deal, newest first.
 *
 * The owner asked to see each deal start and each transaction in the admin
 * panel. This reads the audit trail rather than fanning a `Notification` row
 * out to every staff member: the trail is written anyway, it cannot be marked
 * read and then lost, and one query serves however many staff are looking.
 *
 * `AuditLog` deliberately has no foreign key to `Order` — the trail has to
 * outlive the thing it describes — so the join happens here, and a row whose
 * order has since gone is left out rather than crashing the page.
 */

/**
 * The words somebody typed, if this audit row carries any.
 *
 * `resolveDeal` writes the note a person gave for pausing or ending a deal into
 * `after.note`, and listing decisions write theirs into `after.reason`. Nothing
 * read either back, so a dispute reached the staff desk as "raised a dispute"
 * and nobody could see why. `after` is JSON written by many callers over the
 * years, so this reads it defensively: a row without a note is "no note", never
 * a crash on the page that is trying to decide the dispute.
 */
export function noteFrom(after: unknown): string | null {
  if (typeof after !== "object" || after === null || Array.isArray(after)) {
    return null;
  }
  const fields = after as Record<string, unknown>;
  for (const key of ["note", "reason"]) {
    const value = fields[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

export type DealActivityRow = {
  id: string;
  action: string;
  createdAt: Date;
  actorName: string | null;
  orderId: string;
  orderReference: string;
  orderStatus: OrderStatus;
  listingTitle: string;
  /** What the buyer owes the platform on this deal, in cents. */
  amountUsd: number;
  /** What the actor wrote when they did this, if they wrote anything. */
  note: string | null;
};

export async function listDealActivity(
  limit = 100,
): Promise<DealActivityRow[]> {
  const entries = await db.auditLog.findMany({
    where: { entity: "order" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      action: true,
      createdAt: true,
      entityId: true,
      after: true,
      actor: { select: { name: true } },
    },
  });

  if (entries.length === 0) return [];

  const orders = await db.order.findMany({
    where: { id: { in: [...new Set(entries.map((e) => e.entityId))] } },
    select: {
      id: true,
      reference: true,
      status: true,
      totalUsd: true,
      listing: { select: { title: true } },
    },
  });
  const byId = new Map(orders.map((o) => [o.id, o]));

  return entries.flatMap((entry) => {
    const order = byId.get(entry.entityId);
    if (!order) return [];
    return [
      {
        id: entry.id,
        action: entry.action,
        createdAt: entry.createdAt,
        actorName: entry.actor?.name ?? null,
        orderId: order.id,
        orderReference: order.reference,
        orderStatus: order.status,
        listingTitle: order.listing.title,
        amountUsd: order.totalUsd,
        note: noteFrom(entry.after),
      },
    ];
  });
}

/**
 * The agent queue.
 *
 * `agentId` picks out one agent's own deals; omitting it lists the ones
 * nobody has taken yet. Without the filter the "my queue" link in the agent
 * rail showed every unclaimed deal on the platform, which is not a queue.
 */
export async function listDealsForAgent(agentId: string, limit = 50) {
  const orders = await db.order.findMany({
    where: {
      agentId,
      status: {
        notIn: [
          "COMPLETED",
          "PAYMENT_EXPIRED",
          "CANCELLED",
          "RETURNED_TO_SELLER",
          "REFUNDED",
        ],
      },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      reference: true,
      mode: true,
      status: true,
      priceUsd: true,
      createdAt: true,
      // Where the agent talks to both sides and can work the steps.
      conversationId: true,
      listing: { select: { title: true, slug: true } },
      // Whose move it is comes from the first open step, not the status:
      // one status can cover the seller's step and then the agent's.
      steps: {
        where: { completedAt: null },
        orderBy: { position: "asc" },
        take: 1,
        select: { actor: true },
      },
    },
  });
  return orders.map(({ steps, ...order }) => ({
    ...order,
    awaiting: (steps[0]?.actor as DealActor | undefined) ?? null,
  }));
}

/** Deals with nobody holding them, oldest first. */
export async function listDealsNeedingAgent(limit = 50) {
  return db.order.findMany({
    where: {
      agentId: null,
      status: {
        notIn: [
          "AWAITING_PAYMENT",
          "COMPLETED",
          "PAYMENT_EXPIRED",
          "CANCELLED",
          "RETURNED_TO_SELLER",
          "REFUNDED",
        ],
      },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      reference: true,
      mode: true,
      status: true,
      priceUsd: true,
      createdAt: true,
      // How far the deal got, for the outcomes offered beside it.
      paymentRef: true,
      custodyAt: true,
      buyerPaidAt: true,
      listing: { select: { title: true, slug: true } },
    },
  });
}

/**
 * Deals held by an agent who can no longer act on them.
 *
 * A suspended agent still owns the channels they were holding, and so does one
 * moved to another role — neither can act on the deal any more (roleOnDeal) —
 * so these need a human to move them on rather than waiting to be noticed.
 */
export async function listDealsNeedingReassignment(limit = 50) {
  return db.order.findMany({
    where: {
      mode: "SAFEST",
      status: {
        in: [
          "AWAITING_CUSTODY",
          "IN_CUSTODY",
          "AWAITING_BUYER_PAYMENT",
          "AWAITING_HANDOVER",
        ],
      },
      agent: {
        OR: [{ bannedAt: { not: null } }, { role: { not: "AGENT" } }],
      },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      reference: true,
      status: true,
      // A suspended agent holding somebody's channel is the most urgent
      // thing on the staff desk, and without this it was the only queue
      // that could not say how long it had been like that.
      createdAt: true,
      paymentRef: true,
      custodyAt: true,
      buyerPaidAt: true,
      agent: { select: { id: true, name: true, email: true } },
      listing: { select: { title: true } },
    },
  });
}
