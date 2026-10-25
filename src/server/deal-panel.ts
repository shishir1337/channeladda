import "server-only";

import { db } from "@/lib/db";
import type { DealActor } from "@/lib/deal-machine";
import { isTerminal } from "@/lib/deal-machine";
import type { PanelInput, PanelViewer } from "@/lib/deal-panel";
import { awaitsAgent } from "@/lib/deal-templates";
import { heldByAcceptedOffer, offerTurn } from "@/server/offers";

/**
 * Everything the deal panel is worked out from, for one listing of one
 * conversation.
 *
 * The conversation is one buyer and one seller, and may be about several
 * of the seller's listings — two deals can run in it at once. So the panel
 * is per listing: that buyer's offers on that listing, and the deals on it
 * linked to this conversation, the newest of each. Null for a listing that
 * is not the seller's. Whether the reader may see the conversation at all —
 * and, for the agent of a deal, this listing — is decided before this is
 * called, by the same rule as the thread itself; this only reads.
 */
export async function loadPanelInput(
  conversationId: string,
  listingId: string,
  viewer: PanelViewer,
  now = new Date(),
): Promise<PanelInput | null> {
  const [thread, listing] = await Promise.all([
    db.conversation.findUnique({
      where: { id: conversationId },
      select: { buyerId: true, sellerId: true },
    }),
    db.listing.findUnique({
      where: { id: listingId },
      select: { sellerId: true, status: true, priceUsd: true },
    }),
  ]);
  if (!thread || !listing || listing.sellerId !== thread.sellerId) return null;

  const [latest, held, order] = await Promise.all([
    db.offer.findFirst({
      where: { listingId, buyerId: thread.buyerId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amountUsd: true,
        bySeller: true,
        status: true,
        expiresAt: true,
      },
    }),
    heldByAcceptedOffer(listingId, thread.buyerId),
    db.order.findFirst({
      where: { conversationId, listingId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reference: true,
        mode: true,
        status: true,
        holdUntil: true,
        agentId: true,
        sellerPayTo: true,
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
    listingStatus: listing.status,
    askingCents: listing.priceUsd,
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
          payToMissing:
            order.mode === "SAFEST" &&
            !isTerminal(order.status) &&
            next?.label === "Pay the seller" &&
            !order.sellerPayTo?.trim(),
        }
      : null,
    now,
  };
}
