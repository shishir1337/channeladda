import "server-only";

import type { OrderStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

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
      },
    ];
  });
}

/** Deals with nobody holding them, oldest first — the agent queue. */
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
      listing: { select: { title: true, slug: true } },
    },
  });
}

/**
 * Deals held by an agent who can no longer act on them.
 *
 * A suspended agent still owns the channels they were holding, so these need a
 * human to move them on rather than waiting to be noticed.
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
      agent: { bannedAt: { not: null } },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      reference: true,
      status: true,
      agent: { select: { name: true, email: true } },
      listing: { select: { title: true } },
    },
  });
}
