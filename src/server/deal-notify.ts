import "server-only";

import { db } from "@/lib/db";
import type { DealActor } from "@/lib/deal-machine";
import { templateFor } from "@/lib/deal-templates";

/**
 * Telling the next person it is their turn.
 *
 * A deal is nine steps with two multi-day waits in the middle. Without this
 * the counterparty finds out it is their move only by happening to open the
 * dashboard, which for a seller waiting on a Google transfer could be days.
 *
 * Best effort, deliberately: a deal step must never fail because a
 * notification could not be written. The step is the thing that matters and
 * it has already happened by the time this runs.
 */
export async function notifyNextActor(orderId: string): Promise<void> {
  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        reference: true,
        mode: true,
        status: true,
        buyerId: true,
        sellerId: true,
        agentId: true,
        listing: { select: { title: true } },
        steps: {
          where: { completedAt: null },
          orderBy: { position: "asc" },
          take: 1,
          select: { position: true, label: true, actor: true },
        },
      },
    });

    if (!order) return;

    const next = order.steps[0];
    if (!next) return;

    const recipients: Partial<Record<DealActor, string | null>> = {
      buyer: order.buyerId,
      seller: order.sellerId,
      agent: order.agentId,
    };
    const userId = recipients[next.actor as DealActor];
    if (!userId) return;

    await db.notification.create({
      data: {
        userId,
        kind: "ORDER",
        title: `${next.label} — ${order.reference}`,
        body: `Your move on ${order.listing.title}.`,
        href: `/dashboard/deals/${order.id}`,
      },
    });
  } catch (error) {
    console.error(`[deal-notify] ${orderId}`, error);
  }
}

/** Both sides, when a deal ends some way other than by completing. */
export async function notifyDealEnded(
  orderId: string,
  outcome: string,
): Promise<void> {
  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        reference: true,
        buyerId: true,
        sellerId: true,
        agentId: true,
        listing: { select: { title: true } },
      },
    });
    if (!order) return;

    const ids = [order.buyerId, order.sellerId, order.agentId].filter(
      (id): id is string => Boolean(id),
    );

    await db.notification.createMany({
      data: ids.map((userId) => ({
        userId,
        kind: "ORDER" as const,
        title: `${outcome} — ${order.reference}`,
        body: `The deal for ${order.listing.title} has closed.`,
        href: `/dashboard/deals/${order.id}`,
      })),
    });
  } catch (error) {
    console.error(`[deal-notify] ended ${orderId}`, error);
  }
}

/** How many steps of this deal are still to come, for a progress line. */
export function stepsRemaining(
  mode: "SAFEST" | "FASTEST",
  nextPosition: number | null,
): number {
  const total = templateFor(mode).length;
  return nextPosition === null ? 0 : total - nextPosition + 1;
}
