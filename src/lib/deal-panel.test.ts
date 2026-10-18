import { expect, test } from "vitest";
import {
  dealPanelState,
  type PanelDeal,
  type PanelInput,
  type PanelOffer,
  type PanelState,
  type PanelViewer,
} from "@/lib/deal-panel";

/**
 * What each person can do next in a conversation — one row per situation.
 *
 * The panel shows one action at a time, and this function is the only place
 * that decides which. Every row of the design's tables is here, for the
 * buyer and the seller, plus the agent, staff, and the cases where a wrong
 * answer would offer somebody a button the server would refuse.
 */

const NOW = new Date("2026-10-19T12:00:00Z");
const LATER = new Date("2026-10-20T12:00:00Z");
const EARLIER = new Date("2026-10-18T12:00:00Z");

const base: Omit<PanelInput, "viewer"> = {
  listingStatus: "LIVE",
  askingCents: 250_000,
  latestOffer: null,
  heldOffer: null,
  deal: null,
  now: NOW,
};

const buyerOffer: PanelOffer = {
  id: "o1",
  amountCents: 200_000,
  bySeller: false,
  effectiveStatus: "OPEN",
  expiresAt: LATER,
};
const sellerPrice: PanelOffer = { ...buyerOffer, id: "o2", bySeller: true };
const held = { id: "o3", amountCents: 220_000, heldUntil: LATER };

function deal(over: Partial<PanelDeal>): PanelDeal {
  return {
    id: "d1",
    reference: "CA-40218",
    mode: "SAFEST",
    status: "AWAITING_CUSTODY",
    nextStep: {
      position: 2,
      label: "Invite the agent as channel owner",
      actor: "seller",
    },
    holdUntil: null,
    ...over,
  };
}

type Row = {
  name: string;
  viewer: PanelViewer;
  input: Partial<Omit<PanelInput, "viewer">>;
  want: PanelState;
};

const ROWS: Row[] = [
  // ---- buyer
  {
    name: "buyer: listing on sale, nothing open",
    viewer: "buyer",
    input: {},
    want: { kind: "buy", askingCents: 250_000 },
  },
  {
    name: "buyer: their offer waits on the seller",
    viewer: "buyer",
    input: { latestOffer: buyerOffer },
    want: { kind: "offer-waiting-on-them", offer: buyerOffer },
  },
  {
    name: "buyer: the seller's price waits on them",
    viewer: "buyer",
    input: { latestOffer: sellerPrice },
    want: { kind: "offer-your-turn", offer: sellerPrice },
  },
  {
    name: "buyer: holds an accepted offer",
    viewer: "buyer",
    input: { listingStatus: "RESERVED", heldOffer: held },
    want: { kind: "start-deal", priceCents: 220_000, heldUntil: LATER },
  },
  {
    name: "buyer: deal awaiting payment",
    viewer: "buyer",
    input: {
      listingStatus: "RESERVED",
      deal: deal({
        status: "AWAITING_PAYMENT",
        nextStep: { position: 1, label: "Pay the admin fee", actor: "buyer" },
      }),
    },
    want: { kind: "pay", dealId: "d1" },
  },
  {
    name: "buyer: safest price due",
    viewer: "buyer",
    input: {
      listingStatus: "RESERVED",
      deal: deal({
        mode: "SAFEST",
        status: "AWAITING_BUYER_PAYMENT",
        nextStep: {
          position: 6,
          label: "Pay the price to Channel Adda",
          actor: "buyer",
        },
      }),
    },
    want: { kind: "pay", dealId: "d1" },
  },
  {
    name: "seller: safest price due is the buyer's move",
    viewer: "seller",
    input: {
      listingStatus: "RESERVED",
      deal: deal({
        mode: "SAFEST",
        status: "AWAITING_BUYER_PAYMENT",
        nextStep: {
          position: 6,
          label: "Pay the price to Channel Adda",
          actor: "buyer",
        },
      }),
    },
    want: { kind: "step", dealId: "d1", yourMove: false },
  },
  {
    name: "buyer: deal running, their move",
    viewer: "buyer",
    input: {
      listingStatus: "RESERVED",
      deal: deal({
        status: "IN_CUSTODY",
        nextStep: { position: 5, label: "Inspect the channel", actor: "buyer" },
      }),
    },
    want: { kind: "step", dealId: "d1", yourMove: true },
  },
  {
    name: "buyer: deal running, someone else's move",
    viewer: "buyer",
    input: { listingStatus: "RESERVED", deal: deal({}) },
    want: { kind: "step", dealId: "d1", yourMove: false },
  },
  {
    name: "completed-deal",
    viewer: "buyer",
    input: {
      listingStatus: "SOLD",
      deal: deal({ status: "COMPLETED", nextStep: null }),
    },
    want: { kind: "finished", dealId: "d1", status: "COMPLETED" },
  },
  {
    name: "buyer: listing reserved for someone else",
    viewer: "buyer",
    input: { listingStatus: "RESERVED" },
    want: { kind: "unavailable", listingStatus: "RESERVED" },
  },
  {
    name: "buyer: listing sold to someone else",
    viewer: "buyer",
    input: { listingStatus: "SOLD" },
    want: { kind: "unavailable", listingStatus: "SOLD" },
  },
  {
    name: "buyer: listing paused",
    viewer: "buyer",
    input: { listingStatus: "PAUSED" },
    want: { kind: "unavailable", listingStatus: "PAUSED" },
  },
  {
    name: "buyer: listing removed",
    viewer: "buyer",
    input: { listingStatus: "REMOVED" },
    want: { kind: "unavailable", listingStatus: "REMOVED" },
  },

  // ---- seller
  {
    name: "seller: listing on sale, nothing open",
    viewer: "seller",
    input: {},
    want: { kind: "propose", askingCents: 250_000 },
  },
  {
    name: "seller: the buyer's offer waits on them",
    viewer: "seller",
    input: { latestOffer: buyerOffer },
    want: { kind: "offer-your-turn", offer: buyerOffer },
  },
  {
    name: "seller: their price waits on the buyer",
    viewer: "seller",
    input: { latestOffer: sellerPrice },
    want: { kind: "offer-waiting-on-them", offer: sellerPrice },
  },
  {
    name: "seller: the buyer holds the accepted offer",
    viewer: "seller",
    input: { listingStatus: "RESERVED", heldOffer: held },
    want: { kind: "waiting-to-start", heldUntil: LATER },
  },
  {
    name: "seller: deal awaiting payment",
    viewer: "seller",
    input: {
      listingStatus: "RESERVED",
      deal: deal({ status: "AWAITING_PAYMENT" }),
    },
    want: { kind: "waiting-for-payment", dealId: "d1" },
  },
  {
    name: "seller: deal running, their move",
    viewer: "seller",
    input: { listingStatus: "RESERVED", deal: deal({}) },
    want: { kind: "step", dealId: "d1", yourMove: true },
  },
  {
    name: "seller: deal finished",
    viewer: "seller",
    input: {
      listingStatus: "SOLD",
      deal: deal({ status: "COMPLETED", nextStep: null }),
    },
    want: { kind: "finished", dealId: "d1", status: "COMPLETED" },
  },

  // ---- agent and staff
  {
    name: "agent-running",
    viewer: "agent",
    input: {
      listingStatus: "RESERVED",
      deal: deal({
        nextStep: {
          position: 3,
          label: "Accept and confirm custody",
          actor: "agent",
        },
      }),
    },
    want: { kind: "step", dealId: "d1", yourMove: true },
  },
  {
    name: "agent-after-end",
    viewer: "agent",
    input: {
      listingStatus: "LIVE",
      deal: deal({ status: "RETURNED_TO_SELLER", nextStep: null }),
    },
    want: { kind: "finished", dealId: "d1", status: "RETURNED_TO_SELLER" },
  },
  {
    name: "agent: no deal at all, never an offer button",
    viewer: "agent",
    input: { latestOffer: buyerOffer },
    want: { kind: "unavailable", listingStatus: "LIVE" },
  },
  {
    name: "staff",
    viewer: "staff",
    input: { deal: deal({}) },
    want: { kind: "staff", dealId: "d1" },
  },
  {
    name: "staff: no deal",
    viewer: "staff",
    input: { latestOffer: buyerOffer },
    want: { kind: "staff", dealId: null },
  },

  // ---- the cases a wrong answer would put a refused button on screen
  {
    name: "disputed-not-your-move",
    viewer: "seller",
    input: { listingStatus: "RESERVED", deal: deal({ status: "DISPUTED" }) },
    want: { kind: "step", dealId: "d1", yourMove: false },
  },
  {
    name: "hold-running-not-your-move",
    viewer: "agent",
    input: {
      listingStatus: "RESERVED",
      deal: deal({
        mode: "FASTEST",
        status: "AWAITING_RELEASE",
        holdUntil: LATER,
        nextStep: {
          position: 6,
          label: "Release the seller's funds",
          actor: "agent",
        },
      }),
    },
    want: { kind: "step", dealId: "d1", yourMove: false },
  },
  {
    name: "hold over: the agent's move again",
    viewer: "agent",
    input: {
      listingStatus: "RESERVED",
      deal: deal({
        mode: "FASTEST",
        status: "AWAITING_RELEASE",
        holdUntil: EARLIER,
        nextStep: {
          position: 6,
          label: "Release the seller's funds",
          actor: "agent",
        },
      }),
    },
    want: { kind: "step", dealId: "d1", yourMove: true },
  },
  {
    name: "held-offer-beats-asking-price",
    viewer: "buyer",
    input: { listingStatus: "LIVE", heldOffer: held },
    want: { kind: "start-deal", priceCents: 220_000, heldUntil: LATER },
  },
  {
    name: "expired-offer-is-not-open",
    viewer: "seller",
    input: { latestOffer: { ...buyerOffer, effectiveStatus: "EXPIRED" } },
    want: { kind: "propose", askingCents: 250_000 },
  },
  {
    name: "lapsed-deal-listing-live (buyer)",
    viewer: "buyer",
    input: { deal: deal({ status: "PAYMENT_EXPIRED", nextStep: null }) },
    want: { kind: "buy", askingCents: 250_000 },
  },
  {
    name: "lapsed-deal-listing-live (seller)",
    viewer: "seller",
    input: { deal: deal({ status: "PAYMENT_EXPIRED", nextStep: null }) },
    want: { kind: "propose", askingCents: 250_000 },
  },
  {
    name: "lapsed-deal-listing-reserved",
    viewer: "buyer",
    input: {
      listingStatus: "RESERVED",
      deal: deal({ status: "PAYMENT_EXPIRED", nextStep: null }),
    },
    want: { kind: "unavailable", listingStatus: "RESERVED" },
  },
];

test.each(ROWS)("$name", ({ viewer, input, want }) => {
  expect(dealPanelState({ ...base, ...input, viewer })).toEqual(want);
});
