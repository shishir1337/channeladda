import type { DealMode, OrderStatus } from "@/generated/prisma/enums";
import type { DealActor } from "@/lib/deal-machine";

/**
 * Database values, translated.
 *
 * `AWAITING_BUYER_PAYMENT` is a column value; it is not something anybody
 * should have to decode with a five-figure sum in the air. Every status
 * therefore has two things here: a short human label for a badge, and one
 * plain sentence saying what it means **for the person reading it** — buyer,
 * seller and agent are told different things because different things are
 * true for each of them.
 *
 * The rule this copy must never break: on a Safest deal Channel Adda holds
 * the *channel*, never the buyer's money. The price goes from buyer to seller
 * directly.
 */

export type StatusTone = "neutral" | "info" | "verified" | "danger";

/**
 * Viewer-neutral on purpose. The label this replaces said "your payment",
 * which read as a lie to the seller looking at the same deal.
 */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  AWAITING_PAYMENT: "Waiting for the buyer's payment",
  AGENT_VERIFYING: "Our agent is checking the channel",
  AWAITING_CUSTODY: "Waiting for the seller to hand the channel over",
  IN_CUSTODY: "Our agent is holding the channel",
  AWAITING_BUYER_PAYMENT: "Waiting for the buyer to pay the price",
  AWAITING_HANDOVER: "Transfer under way",
  AWAITING_RELEASE: "Releasing the seller's funds",
  COMPLETED: "Completed",
  PAYMENT_EXPIRED: "Payment window closed",
  CANCELLED: "Cancelled",
  RETURNED_TO_SELLER: "Channel returned to the seller",
  REFUNDED: "Refunded",
  DISPUTED: "Paused, with Channel Adda",
};

/**
 * The same thing, short enough for a badge in a list row.
 *
 * A 360px row cannot hold "Waiting for the seller to hand the channel over"
 * on one line, and a badge does not wrap, so the long label would have pushed
 * the row past the edge of the screen.
 */
export const STATUS_SHORT: Record<OrderStatus, string> = {
  AWAITING_PAYMENT: "Needs payment",
  AGENT_VERIFYING: "Being checked",
  AWAITING_CUSTODY: "Handing over to us",
  IN_CUSTODY: "We hold the channel",
  AWAITING_BUYER_PAYMENT: "Buyer paying the price",
  AWAITING_HANDOVER: "Transferring",
  AWAITING_RELEASE: "Paying the seller",
  COMPLETED: "Completed",
  PAYMENT_EXPIRED: "Payment expired",
  CANCELLED: "Cancelled",
  RETURNED_TO_SELLER: "Returned to seller",
  REFUNDED: "Refunded",
  DISPUTED: "Paused",
};

/**
 * One meaning per colour, everywhere: blue is in flight, green is finished,
 * red is trouble, grey has stopped. Gold is kept for "this is waiting on you"
 * so it never has to compete with a status.
 */
export const STATUS_TONE: Record<OrderStatus, StatusTone> = {
  AWAITING_PAYMENT: "info",
  AGENT_VERIFYING: "info",
  AWAITING_CUSTODY: "info",
  IN_CUSTODY: "info",
  AWAITING_BUYER_PAYMENT: "info",
  AWAITING_HANDOVER: "info",
  AWAITING_RELEASE: "info",
  COMPLETED: "verified",
  PAYMENT_EXPIRED: "neutral",
  CANCELLED: "neutral",
  RETURNED_TO_SELLER: "neutral",
  REFUNDED: "neutral",
  DISPUTED: "danger",
};

export const SIDE_LABELS: Record<"buyer" | "seller" | "agent", string> = {
  buyer: "Buying",
  seller: "Selling",
  agent: "Holding",
};

export const ACTOR_LABELS: Record<DealActor, string> = {
  buyer: "the buyer",
  seller: "the seller",
  agent: "our agent",
  staff: "Channel Adda",
  system: "Channel Adda",
};

/** "you" when it is the reader's own move, which is the whole point. */
export function actorLabel(actor: DealActor, viewer: DealActor): string {
  return actor === viewer ? "you" : ACTOR_LABELS[actor];
}

/**
 * What this status means for this reader, in one sentence.
 *
 * A switch rather than a table because the sentence genuinely differs by mode
 * and by side, and a table of thirteen statuses times two modes times five
 * roles is how the Safest and Fastest copy got mixed up the first time.
 */
export function statusSentence(
  status: OrderStatus,
  mode: DealMode,
  viewer: DealActor,
): string {
  const safest = mode === "SAFEST";

  switch (status) {
    case "AWAITING_PAYMENT":
      if (viewer === "buyer") {
        return safest
          ? "Nothing starts until our fee is paid. The channel's price is not paid now and never paid to us — it goes to the seller later, directly from you."
          : "Nothing starts until your payment reaches Channel Adda. We hold it until you confirm the channel is yours.";
      }
      if (viewer === "seller") {
        return "The buyer has not paid yet. Your channel stays with you, and nothing is asked of you until they do.";
      }
      return "The buyer has not paid yet, so no step has opened.";

    case "AGENT_VERIFYING":
      if (viewer === "buyer") {
        return "Channel Adda is holding your payment. Our agent is checking the channel matches the listing before anything is handed over.";
      }
      if (viewer === "seller") {
        return "Our agent is checking the channel matches the listing. The buyer's payment is with Channel Adda in the meantime.";
      }
      return "The channel is being checked against the listing.";

    case "AWAITING_CUSTODY":
      if (viewer === "buyer") {
        return "The seller is handing the channel to our agent. You have paid our fee and nothing else — you pay the seller only once the channel is verifiably out of their hands.";
      }
      if (viewer === "seller") {
        return "Invite our agent as the channel's owner. Google then runs its own waiting period before the transfer completes.";
      }
      return "The seller is inviting the agent as owner of the channel.";

    case "IN_CUSTODY":
      if (viewer === "buyer") {
        return "Our agent owns the channel now, not the seller. Look it over, and only then pay the price — to Channel Adda, never to the seller.";
      }
      if (viewer === "seller") {
        return "The channel is with our agent — out of your hands and not yet in the buyer's. The buyer pays the price to Channel Adda next, and it is held for you.";
      }
      return "You are holding this channel.";

    case "AWAITING_BUYER_PAYMENT":
      if (viewer === "buyer") {
        return "Pay the price to Channel Adda here, by crypto or from your balance. We hold it until the channel is yours, then pay the seller — never pay the seller yourself.";
      }
      if (viewer === "seller") {
        return "The buyer is paying the price to Channel Adda. It is held for you and reaches your Channel Adda wallet when the transfer completes.";
      }
      return "The buyer is paying the price to Channel Adda. The channel stays with you until it arrives.";

    case "AWAITING_HANDOVER":
      if (safest) {
        if (viewer === "buyer") {
          return "Your payment is with Channel Adda and our agent is transferring the channel to you. Google's second waiting period applies.";
        }
        if (viewer === "seller") {
          return "The buyer has paid the price to Channel Adda, so your part is done. Our agent is transferring the channel, and the price reaches your wallet when it completes.";
        }
        return "Transfer the channel to the buyer.";
      }
      if (viewer === "buyer") {
        return "Channel Adda is still holding your payment. The seller is making you the channel's owner — confirm here once you are in control of it.";
      }
      if (viewer === "seller") {
        return "Make the buyer the channel's primary owner. Channel Adda releases your money once they confirm access.";
      }
      return "The seller is promoting the buyer to owner, with our agent supervising.";

    case "AWAITING_RELEASE":
      if (viewer === "buyer") {
        return "You have confirmed access, so nothing more is needed from you. We are paying the seller.";
      }
      if (viewer === "seller") {
        return "The buyer has confirmed access. Channel Adda is releasing your money.";
      }
      return "Release the seller's funds.";

    case "COMPLETED":
      if (viewer === "buyer") return "Finished. The channel is yours.";
      if (viewer === "seller") {
        return safest
          ? "Finished. The buyer paid you directly and the channel has moved on."
          : "Finished. Channel Adda has released your money.";
      }
      return "Finished. Nothing is outstanding on this deal.";

    case "PAYMENT_EXPIRED":
      return "The payment window closed before the money arrived, so this deal never started and the listing went back on the market.";

    case "CANCELLED":
      return "This deal was stopped before anything changed hands.";

    case "RETURNED_TO_SELLER":
      if (viewer === "seller") {
        return "Our agent has given the channel back to you. Nothing was transferred to the buyer.";
      }
      return "Our agent returned the channel to the seller, so nothing was transferred.";

    case "REFUNDED":
      if (viewer === "buyer") {
        return "Channel Adda has refunded you. Nothing was transferred.";
      }
      return "The buyer has been refunded and nothing was transferred.";

    case "DISPUTED":
      return "A moderator is reading the whole record, including every step and payment reference on it. Nothing moves until they decide, and we may message you for details.";

    default:
      return STATUS_LABELS[status];
  }
}

/** One reader's headline: the badge, its short form, and the sentence. */
export type DealHeadline = { label: string; short: string; sentence: string };

type Override = {
  label: string;
  short: string;
  sentence: Record<"buyer" | "seller" | "agent", string>;
};

/**
 * The statuses that span steps owned by different people, keyed
 * `MODE:STATUS:whose step is open`. Only the combinations where the
 * status-level copy would be wrong are listed; everything else falls back.
 */
const BY_OPEN_STEP: Partial<Record<string, Override>> = {
  // Safest custody: the seller invites (step 2), then the agent accepts and
  // waits out Google's transfer (steps 3 and 4).
  "SAFEST:AWAITING_CUSTODY:agent": {
    label: "Our agent is taking the channel",
    short: "Agent taking over",
    sentence: {
      buyer:
        "The seller has invited our agent, who is taking the channel over while Google runs its own waiting period. You pay the seller only once it is verifiably ours.",
      seller:
        "You have invited our agent, so your part is done for now. Google runs its own waiting period while our agent takes the channel over.",
      agent:
        "The seller has invited you. Accept it, then confirm custody once Google's transfer completes.",
    },
  },
  // Fastest verifying: the seller invites the agent as manager (step 2)
  // before the agent can check anything (step 3).
  "FASTEST:AGENT_VERIFYING:seller": {
    label: "Waiting for the seller to invite our agent",
    short: "Seller inviting agent",
    sentence: {
      buyer:
        "Channel Adda is holding your payment. The seller is giving our agent manager access, so the handover is supervised.",
      seller:
        "Give our agent manager access to the channel — the address to invite is on this page. The buyer's payment is with Channel Adda in the meantime.",
      agent: "The seller is inviting you as manager.",
    },
  },
  // Fastest handover: the seller promotes the buyer (step 4), then the buyer
  // confirms access (step 5).
  "FASTEST:AWAITING_HANDOVER:buyer": {
    label: "Waiting for the buyer to confirm access",
    short: "Buyer confirming",
    sentence: {
      buyer:
        "The seller says you are now the primary owner. Confirm here once you are in control of the channel — that is what releases their money.",
      seller:
        "You have promoted the buyer. Channel Adda releases your money once they confirm access.",
      agent: "The buyer is confirming they have access.",
    },
  },
};

/**
 * What the deal says at the top for this reader, given whose step is open.
 *
 * A status can cover several steps owned by different people, and copy
 * written for the status alone went stale the moment the first of them was
 * done: the seller who had just invited the agent was still told to invite
 * the agent, and the agent's desk still said "with the seller".
 */
export function dealHeadline(
  status: OrderStatus,
  mode: DealMode,
  viewer: DealActor,
  awaiting: DealActor | null,
): DealHeadline {
  const override = awaiting
    ? BY_OPEN_STEP[`${mode}:${status}:${awaiting}`]
    : undefined;
  if (override) {
    const reader =
      viewer === "buyer" || viewer === "seller" ? viewer : ("agent" as const);
    return {
      label: override.label,
      short: override.short,
      sentence: override.sentence[reader],
    };
  }
  return {
    label: STATUS_LABELS[status],
    short: STATUS_SHORT[status],
    sentence: statusSentence(status, mode, viewer),
  };
}

/**
 * Where the money is, in one line, for this reader.
 *
 * The distinction this carries is the product's whole shape: Safest escrows
 * the channel and Fastest escrows the money. Nothing here may suggest the
 * platform is holding a Safest buyer's price.
 */
export function moneyNote(mode: DealMode, viewer: DealActor): string {
  if (mode === "SAFEST") {
    if (viewer === "buyer") {
      return "Channel Adda never holds the channel's price. You pay our fee up front, and you pay the seller directly once our agent owns the channel.";
    }
    if (viewer === "seller") {
      return "The buyer pays you directly, off the platform. What Channel Adda holds in the meantime is your channel, not your money.";
    }
    return "The buyer pays our fee up front and pays the seller directly. Channel Adda holds the channel, not the price.";
  }
  if (viewer === "buyer") {
    return "Channel Adda holds the price and the fee together, and releases the price to the seller only after you confirm you have access.";
  }
  if (viewer === "seller") {
    return "Channel Adda is holding the buyer's payment and pays you once the buyer confirms they have access to the channel.";
  }
  return "Channel Adda holds the whole amount until the buyer confirms access.";
}

/**
 * The Google waiting periods.
 *
 * Says "usually about 7 days" and never a date: the wait is Google's, there is
 * no API that reports when a Brand Account transfer finishes, and a promised
 * date would be the one thing on this page that is not true.
 */
export const HOLD_NOTE =
  "This is Google's own waiting period, usually about 7 days. Our agent confirms it the moment it completes — there is nothing to do but wait.";

export function isHoldStep(label: string): boolean {
  return label.startsWith("Hold ");
}

/** Needs a transaction reference: the buyer paying the seller directly. */
export function needsPaymentRef(label: string): boolean {
  return label === "Pay the seller directly";
}

/**
 * What each step actually involves, in words a first-time seller can act on.
 *
 * Keyed by the step labels in `@/lib/deal-templates`. An unknown label gets no
 * explanation rather than a wrong one, so adding a step to a template can
 * never make this file lie.
 */
const STEP_HELP: Record<string, string> = {
  "Pay the admin fee":
    "Channel Adda's fee, and nothing more. The channel's price is paid later, by the buyer, straight to the seller.",
  "Invite the agent as channel owner":
    "The seller invites our agent's Google account as owner of the channel. The address to invite is on this page.",
  "Accept and confirm custody":
    "Our agent accepts that invitation, which is what starts Google's transfer.",
  "Hold 1 complete, ownership verified":
    "Google finishes the transfer and our agent confirms the channel is genuinely theirs. Only then is it out of the seller's hands.",
  "Inspect the channel":
    "The buyer checks the channel is what the listing described, while our agent holds it.",
  "Pay the seller directly":
    "The buyer sends the channel's price to the seller off-platform, then records the transaction reference here.",
  "Confirm the payment arrived":
    "The seller confirms the money is in their account. Our agent keeps the channel until they do.",
  "Transfer ownership to the buyer":
    "Our agent makes the buyer the owner of the channel.",
  "Hold 2 complete, ownership verified":
    "Google's second waiting period. When it finishes, the channel is the buyer's.",
  "Pay the full amount":
    "The channel's price and our fee together. Channel Adda holds all of it until the buyer confirms access.",
  "Invite the agent as manager":
    "The seller gives our agent manager access so the handover is supervised. The address to invite is on this page.",
  "Verify the channel matches the listing":
    "Our agent checks the channel against the listing before the seller hands it over.",
  "Promote the buyer to primary owner":
    "The seller makes the buyer the channel's primary owner.",
  "Confirm access received":
    "The buyer confirms they are in control of the channel. This is what releases the seller's money.",
  "Release the seller's funds": "Channel Adda pays the seller.",
};

export function stepHelp(label: string): string | undefined {
  return STEP_HELP[label];
}
