import type {
  DealMode,
  ListingStatus,
  OfferStatus,
  OrderStatus,
} from "@/generated/prisma/enums";
import { type DealActor, isTerminal } from "@/lib/deal-machine";

/**
 * What each person can do next in a conversation.
 *
 * The top of every conversation carries one panel with one action, the
 * conversation's equivalent of the deal page's "Your move" card. This is the
 * only place that decides which action that is. Pure, so every situation can
 * be pinned by a test without a database — and so the panel can never offer
 * a button for something the person cannot do now.
 *
 * It decides what to show, never what is allowed: every button behind it
 * calls a server function that checks again.
 */

export type PanelViewer = "buyer" | "seller" | "agent" | "staff";

export type PanelOffer = {
  id: string;
  amountCents: number;
  bySeller: boolean;
  /** As it reads now: an open offer past its expiry is EXPIRED. */
  effectiveStatus: OfferStatus;
  expiresAt: Date;
};

export type PanelDeal = {
  id: string;
  reference: string;
  mode: DealMode;
  status: OrderStatus;
  /** The lowest incomplete step; null once the deal has stopped. */
  nextStep: { position: number; label: string; actor: DealActor } | null;
  holdUntil: Date | null;
};

export type PanelInput = {
  viewer: PanelViewer;
  listingStatus: ListingStatus;
  askingCents: number;
  /** The newest offer in this conversation, in any status. */
  latestOffer: PanelOffer | null;
  /** An accepted offer still holding the listing for this conversation's buyer. */
  heldOffer: { id: string; amountCents: number; heldUntil: Date } | null;
  /** The newest deal in this conversation. */
  deal: PanelDeal | null;
  now: Date;
};

export type PanelState =
  | { kind: "staff"; dealId: string | null }
  | { kind: "pay"; dealId: string }
  | { kind: "waiting-for-payment"; dealId: string }
  | { kind: "step"; dealId: string; yourMove: boolean }
  | { kind: "start-deal"; priceCents: number; heldUntil: Date }
  | { kind: "waiting-to-start"; heldUntil: Date }
  | { kind: "offer-your-turn"; offer: PanelOffer }
  | { kind: "offer-waiting-on-them"; offer: PanelOffer }
  | { kind: "buy"; askingCents: number }
  | { kind: "propose"; askingCents: number }
  | { kind: "finished"; dealId: string; status: OrderStatus }
  | { kind: "unavailable"; listingStatus: ListingStatus };

/**
 * The first rule that matches wins, and the order is the design:
 *
 * 1. Staff read; they never act from here.
 * 2. A running deal outranks everything — there is nothing to negotiate once
 *    money or a channel is moving.
 * 3. An agent is here for a deal and nothing else: never an offer button.
 * 4. An accepted offer holding the listing outranks the asking price, so a
 *    buyer who negotiated $2,200 is never offered $2,500.
 * 5. An open offer is answered before anything new is put on the table.
 * 6. On sale with nothing open: the buyer can buy or offer, the seller can
 *    put a price.
 * 7. A finished sale is shown as finished.
 * 8. Anything else — reserved for somebody else, sold to somebody else,
 *    paused, removed — has nothing to offer.
 */
export function dealPanelState(input: PanelInput): PanelState {
  const { viewer, deal } = input;

  if (viewer === "staff") return { kind: "staff", dealId: deal?.id ?? null };

  if (deal && !isTerminal(deal.status)) {
    if (deal.status === "AWAITING_PAYMENT") {
      return viewer === "buyer"
        ? { kind: "pay", dealId: deal.id }
        : { kind: "waiting-for-payment", dealId: deal.id };
    }
    // The Safest price is the buyer paying us, not a button: the same panel
    // as the opening payment. Everyone else sees whose move it is.
    if (
      viewer === "buyer" &&
      deal.mode === "SAFEST" &&
      deal.status === "AWAITING_BUYER_PAYMENT"
    ) {
      return { kind: "pay", dealId: deal.id };
    }
    // The same rule as the deal page's next-step card: a dispute freezes
    // every step, and a running recovery hold means the release step exists
    // but is not available yet.
    const holdRunning =
      deal.holdUntil !== null && deal.holdUntil.getTime() > input.now.getTime();
    const yourMove =
      deal.status !== "DISPUTED" &&
      !holdRunning &&
      deal.nextStep?.actor === viewer;
    return { kind: "step", dealId: deal.id, yourMove };
  }

  if (viewer === "agent") {
    return deal
      ? { kind: "finished", dealId: deal.id, status: deal.status }
      : { kind: "unavailable", listingStatus: input.listingStatus };
  }

  if (input.heldOffer) {
    return viewer === "buyer"
      ? {
          kind: "start-deal",
          priceCents: input.heldOffer.amountCents,
          heldUntil: input.heldOffer.heldUntil,
        }
      : { kind: "waiting-to-start", heldUntil: input.heldOffer.heldUntil };
  }

  const offer = input.latestOffer;
  if (offer && offer.effectiveStatus === "OPEN") {
    const awaiting = offer.bySeller ? "buyer" : "seller";
    return awaiting === viewer
      ? { kind: "offer-your-turn", offer }
      : { kind: "offer-waiting-on-them", offer };
  }

  if (input.listingStatus === "LIVE") {
    return viewer === "buyer"
      ? { kind: "buy", askingCents: input.askingCents }
      : { kind: "propose", askingCents: input.askingCents };
  }

  if (deal && deal.status === "COMPLETED") {
    return { kind: "finished", dealId: deal.id, status: deal.status };
  }

  return { kind: "unavailable", listingStatus: input.listingStatus };
}
