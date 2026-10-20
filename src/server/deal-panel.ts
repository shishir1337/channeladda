import "server-only";

import { db } from "@/lib/db";
import type { DealActor } from "@/lib/deal-machine";
import { isTerminal } from "@/lib/deal-machine";
import type { PanelInput, PanelViewer } from "@/lib/deal-panel";
import { awaitsAgent } from "@/lib/deal-templates";
import { heldByAcceptedOffer, offerTurn } from "@/server/offers";

/**
 * Everything the deal panel is worked out from, for one conversation.
 *
 * The conversation is one buyer and one listing, so its offers are that
 * buyer's offers on that listing, and its deals are the ones linked to it —
 * the newest of each is what the panel is about. Whether the reader may see
 * the conversation at all is decided before this is called, by the same rule
 * as the thread itself; this only reads.
 */
export async function loadPanelInput(
  conversationId: string,
  viewer: PanelViewer,
  now = new Date(),
): Promise<PanelInput | null> {
  const thread = await db.conversation.findUnique({
    where: { id: conversationId },
    select: {
      buyerId: true,
      listingId: true,
      listing: { select: { status: true, priceUsd: true } },
    },
  });
  if (!thread) return null;

  const [latest, held, order] = await Promise.all([
    db.offer.findFirst({
      where: { listingId: thread.listingId, buyerId: thread.buyerId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amountUsd: true,
        bySeller: true,
        status: true,
        expiresAt: true,
      },
    }),
    heldByAcceptedOffer(thread.listingId, thread.buyerId),
    db.order.findFirst({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reference: true,
        mode: true,
        status: true,
        holdUntil: true,
        agentId: true,
        steps: {
          where: { completedAt: null },
          orderBy: { position: "asc" },
          take: 1,
          select: { position: true, label: true, actor: true },
        },
      },
    }),
  ]);

  const next = order?.steps[0];
  return {
    viewer,
    listingStatus: thread.listing.status,
    askingCents: thread.listing.priceUsd,
    latestOffer: latest
      ? {
          id: latest.id,
          amountCents: latest.amountUsd,
          bySeller: latest.bySeller,
          effectiveStatus: offerTurn(latest, now).effectiveStatus,
          expiresAt: latest.expiresAt,
        }
      : null,
    heldOffer: held
      ? { id: held.id, amountCents: held.amountUsd, heldUntil: held.heldUntil }
      : null,
    deal: order
      ? {
          id: order.id,
          reference: order.reference,
          mode: order.mode,
          status: order.status,
          // As the deal page has it: a deal that has stopped has no next move.
          nextStep:
            next && !isTerminal(order.status)
              ? {
                  position: next.position,
                  label: next.label,
                  actor: next.actor as DealActor,
                }
              : null,
          holdUntil: order.holdUntil,
          awaitingAgent:
            !isTerminal(order.status) &&
            awaitsAgent(order.mode, next?.position ?? null, order.agentId),
        }
      : null,
    now,
  };
}
