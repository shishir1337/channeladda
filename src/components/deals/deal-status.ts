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
 * The rule this copy must never break: nobody is ever exposed. On Fastest the
 * buyer pays Channel Adda, we hold it, and the seller is paid into their
 * Channel Adda wallet once the buyer is primary owner. On Safest our agent
 * holds the channel first, and only then does the buyer pay the seller
 * directly — Channel Adda takes the admin fee and nothing else.
 */

export type StatusTone = "neutral" | "info" | "verified" | "danger";

/**
 * Viewer-neutral on purpose. The label this replaces said "your payment",
 * which read as a lie to the seller looking at the same deal.
 */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  AWAITING_PAYMENT: "Waiting for the buyer's payment",
  AGENT_VERIFYING: "Adding the buyer to the channel",
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
  AGENT_VERIFYING: "Adding the buyer",
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
          ? "Nothing starts until our fee is paid. You do not pay the channel's price now: you pay it to the seller directly, once our agent holds the channel."
          : "Nothing starts until your payment reaches Channel Adda. We hold it until you are the channel's primary owner.";
      }
      if (viewer === "seller") {
        return "The buyer has not paid yet. Your channel stays with you, and nothing is asked of you until they do.";
      }
      return "The buyer has not paid yet, so no step has opened.";

    case "AGENT_VERIFYING":
      if (viewer === "buyer") {
        return "Channel Adda is holding your payment. The seller is adding your account as a manager of the channel.";
      }
      if (viewer === "seller") {
        return "Add the buyer's account as a manager of the channel — it is on this page. The buyer's payment is with Channel Adda in the meantime.";
      }
      return "The seller is adding the buyer as a manager.";

    case "AWAITING_CUSTODY":
      if (viewer === "buyer") {
        return "The seller is handing the channel to our agent. You have paid our fee and nothing else — you pay the seller only once our agent holds the channel.";
      }
      if (viewer === "seller") {
        return "Add our agent as a manager of the channel. The address to add is on this page.";
      }
      return "The seller is adding you as a manager of the channel.";

    case "IN_CUSTODY":
      if (viewer === "buyer") {
        return "Our agent holds the channel now, not the seller. Pay the seller the price directly, the way you agreed in the deal chat, then press Paid.";
      }
      if (viewer === "seller") {
        return "Our agent holds the channel. The buyer pays you directly next, the way you agreed in the deal chat.";
      }
      return "You hold this channel. The buyer pays the seller directly next.";

    case "AWAITING_BUYER_PAYMENT":
      // Only a deal opened before the price went to the seller directly can
      // be here, and its steps are not this page's any more.
      return "This deal began under our earlier steps. Channel Adda will finish it with you in the chat.";

    case "AWAITING_HANDOVER":
      if (safest) {
        if (viewer === "buyer") {
          return "The seller confirmed your payment. Our agent is making you the owner.";
        }
        if (viewer === "seller") {
          return "You confirmed the buyer's payment, so your part is done. Our agent is handing the channel to the buyer.";
        }
        return "Make the buyer the owner, using the account on this page.";
      }
      if (viewer === "buyer") {
        return "You are a manager now. After the holding period, the seller makes you primary owner and removes their own email.";
      }
      if (viewer === "seller") {
        return "When the holding period ends, make the buyer primary owner and remove your email from the channel. We email you the moment it opens.";
      }
      return "The holding period, then the seller makes the buyer primary owner.";

    case "AWAITING_RELEASE":
      if (viewer === "buyer") {
        return "You are the primary owner, so nothing more is needed from you. Our agent checks the handover, then Channel Adda pays the seller.";
      }
      if (viewer === "seller") {
        return "The buyer is primary owner. Once our agent has checked your email is off the channel, your money reaches your Channel Adda wallet.";
      }
      return "Check the buyer is primary owner and the seller's email is gone, then release the seller's funds.";

    case "COMPLETED":
      if (viewer === "buyer") return "Finished. The channel is yours.";
      if (viewer === "seller") {
        return safest
          ? "Finished. The channel is the buyer's, and the buyer paid you directly."
          : "Finished. Channel Adda has released your money to your Channel Adda wallet.";
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
      return "A moderator is reading the whole record: every step, when it was pressed, and the deal chat. Nothing moves until they decide, and we may message you for details.";

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
 * The steps whose status-level copy would be wrong, keyed
 * `MODE:STATUS:open step`. A status spans several steps — on Safest,
 * AWAITING_CUSTODY is two of the seller's and two of our agent's — so the
 * key is the step itself; the status is in it so a paused deal, whose open
 * step has not moved, never reads as running. Everything else falls back.
 */
const BY_OPEN_STEP: Partial<Record<string, Override>> = {
  "SAFEST:AWAITING_CUSTODY:3": {
    label: "Our agent is confirming access",
    short: "Agent confirming",
    sentence: {
      buyer:
        "The seller has added our agent as a manager. Our agent confirms it next, and then Google's waiting period starts.",
      seller:
        "You have added our agent, so your part is done for now. They confirm it next, and then Google's waiting period starts.",
      agent:
        "The seller has added you. Confirm once you have manager access — that starts Google's waiting period.",
    },
  },
  "SAFEST:AWAITING_CUSTODY:4": {
    label: "Our agent becomes primary owner next",
    short: "Agent to primary",
    sentence: {
      buyer:
        "Our agent is a manager. After Google's waiting period, the seller makes our agent primary owner.",
      seller:
        "When Google's waiting period ends, make our agent primary owner of the channel. We email you the moment you can.",
      agent:
        "Google's waiting period, then the seller makes you primary owner.",
    },
  },
  "SAFEST:AWAITING_CUSTODY:5": {
    label: "Our agent is confirming ownership",
    short: "Agent confirming",
    sentence: {
      buyer:
        "The seller says our agent is primary owner now. Our agent confirms it — then you pay the seller.",
      seller:
        "You have made our agent primary owner. They confirm it next, then the buyer pays you.",
      agent: "The seller says you are primary owner. Confirm once you are.",
    },
  },
  "SAFEST:IN_CUSTODY:6": {
    label: "Waiting for the buyer to pay the seller",
    short: "Buyer paying",
    sentence: {
      buyer:
        "Our agent holds the channel now, not the seller. Pay the seller the price directly, the way you agreed in the deal chat, then press Paid.",
      seller:
        "Our agent holds the channel. The buyer pays you directly next, the way you agreed in the deal chat.",
      agent: "You hold the channel. The buyer is paying the seller directly.",
    },
  },
  "SAFEST:IN_CUSTODY:7": {
    label: "Waiting for the seller to confirm the payment",
    short: "Seller confirming",
    sentence: {
      buyer:
        "You have marked it paid. Once the seller confirms the money arrived, our agent makes you the owner.",
      seller:
        "The buyer says they have paid you. When the money is in your account, press Received. If it has not arrived, say so in the deal chat.",
      agent:
        "The buyer says they have paid. Waiting for the seller to confirm it arrived.",
    },
  },
  "SAFEST:AWAITING_HANDOVER:9": {
    label: "Waiting for the buyer to confirm ownership",
    short: "Buyer confirming",
    sentence: {
      buyer:
        "Our agent has made you the owner. Confirm here once the channel is yours.",
      seller:
        "Our agent has handed the channel to the buyer, who confirms it next.",
      agent: "You have made the buyer the owner. They confirm it next.",
    },
  },
  "FASTEST:AGENT_VERIFYING:2": {
    label: "Waiting for the seller to add the buyer",
    short: "Seller adding buyer",
    sentence: {
      buyer:
        "Channel Adda is holding your payment. The seller is adding your account as a manager of the channel.",
      seller:
        "Add the buyer's account as a manager of the channel — it is on this page. The buyer's payment is with Channel Adda in the meantime.",
      agent: "The seller is adding the buyer as a manager.",
    },
  },
  "FASTEST:AGENT_VERIFYING:3": {
    label: "Waiting for the buyer to confirm access",
    short: "Buyer confirming",
    sentence: {
      buyer:
        "The seller says you are a manager now. Check the channel matches the listing, then confirm here — that starts the holding period.",
      seller:
        "You have added the buyer. They confirm their access next, and then the holding period starts.",
      agent: "The buyer is confirming their manager access.",
    },
  },
  "FASTEST:AWAITING_HANDOVER:5": {
    label: "Waiting for the buyer to confirm ownership",
    short: "Buyer confirming",
    sentence: {
      buyer:
        "The seller says you are now the primary owner. Confirm here once you are, and their email is gone from the channel.",
      seller:
        "You have made the buyer primary owner. Channel Adda pays you once they confirm and our agent has checked.",
      agent: "The buyer is confirming primary ownership.",
    },
  },
};

/**
 * What the deal says at the top for this reader, given which step is open.
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
  openStep: number | null,
): DealHeadline {
  const override =
    openStep === null
      ? undefined
      : BY_OPEN_STEP[`${mode}:${status}:${openStep}`];
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
 * Fastest holds the buyer's money with Channel Adda until the buyer is
 * primary owner. Safest holds the channel instead: our agent takes it, and
 * only then does the buyer pay the seller directly — Channel Adda takes the
 * admin fee and nothing else.
 */
export function moneyNote(mode: DealMode, viewer: DealActor): string {
  if (mode === "SAFEST") {
    if (viewer === "buyer") {
      return "You pay Channel Adda only our fee. The channel's price you pay the seller directly, once our agent holds the channel — so the seller cannot take your money and keep the channel.";
    }
    if (viewer === "seller") {
      return "The buyer pays you directly, once our agent holds the channel. Our agent hands it to the buyer only after you confirm the money arrived. Channel Adda takes its fee from the buyer.";
    }
    return "Channel Adda takes only the admin fee. The buyer pays the seller directly while our agent holds the channel, and the handover waits for the seller's Received.";
  }
  if (viewer === "buyer") {
    return "Channel Adda holds the price and the fee together, and pays the seller only once you are the channel's primary owner.";
  }
  if (viewer === "seller") {
    return "Channel Adda is holding the buyer's payment and pays you once the buyer is primary owner and our agent has checked.";
  }
  return "Channel Adda holds the whole amount until the buyer is primary owner.";
}

/** The deal's running hold, on the step it is holding back. */
export const HOLD_NOTE: Readonly<Record<DealMode, string>> = {
  SAFEST:
    "Google makes a new manager wait, usually 7 days, before they can be made primary owner. There is nothing to do but wait — we email you the moment it ends.",
  FASTEST:
    "The buyer stays a manager for the whole holding period before becoming primary owner. There is nothing to do until then — we email you the moment it ends.",
};

/**
 * What each step actually involves, in words a first-time seller can act on.
 *
 * Keyed by mode and then by the step labels in `@/lib/deal-templates`: the
 * two deals share a label or two that mean different things. An unknown
 * label gets no explanation rather than a wrong one, so adding a step to a
 * template can never make this file lie.
 */
const STEP_HELP: Readonly<Record<DealMode, Record<string, string>>> = {
  SAFEST: {
    "Pay the admin fee":
      "Channel Adda's fee, to start, and the only payment Channel Adda takes on this deal. The channel's price goes to the seller directly, once our agent holds the channel.",
    "Add the agent as manager":
      "The seller adds our agent's Google account as a manager of the channel. The address to add is on this page.",
    "Confirm manager access":
      "Our agent confirms the access. That starts Google's waiting period, usually 7 days, before a manager can be made primary owner.",
    "Make the agent primary owner":
      "Once Google's waiting period is over, the seller makes our agent the channel's primary owner. We email the seller the moment they can.",
    "Confirm primary ownership":
      "Our agent confirms they are primary owner. From here the channel is out of the seller's hands, and not yet in the buyer's.",
    "Pay the seller":
      "The buyer pays the seller the price directly — crypto, bank, UPI, whatever the two of you agreed in the deal chat — then presses Paid. Put the transaction id or a screenshot in the chat: it is your proof.",
    "Confirm the payment arrived":
      "The seller presses Received once the money is in their account. Only then does our agent hand the channel over. If it has not arrived, say so in the chat and a moderator will look.",
    "Make the buyer the owner":
      "Our agent makes the buyer's account, named on this page, the channel's owner.",
    "Confirm ownership received":
      "The buyer confirms the channel is theirs. That completes the deal.",
  },
  FASTEST: {
    "Pay the full amount":
      "The channel's price and our fee together. Channel Adda holds all of it until the buyer is primary owner.",
    "Add the buyer as manager":
      "The seller adds the buyer's account, named on this page, as a manager of the channel. Our agent guides it in the chat.",
    "Confirm manager access":
      "The buyer confirms they are a manager and the channel matches the listing. That starts the holding period, shown in the chat, before they can be made primary owner.",
    "Make the buyer primary owner":
      "After the holding period, the seller makes the buyer primary owner and removes their own email from the channel.",
    "Confirm primary ownership":
      "The buyer confirms they are primary owner and the seller's email is gone.",
    "Release the seller's funds":
      "Our agent checks the handover, then Channel Adda pays the seller into their Channel Adda wallet.",
  },
};

/** Clearer than "Mark this done" where the step is a statement of fact. */
const CONFIRM_LABELS: Readonly<Record<string, string>> = {
  "Add the agent as manager": "I have added the agent",
  "Confirm manager access": "I have manager access",
  "Make the agent primary owner": "I have made the agent primary owner",
  "Confirm primary ownership": "I am the primary owner",
  // The client's own words for the two that are the record of the price.
  "Pay the seller": "Paid",
  "Confirm the payment arrived": "Received",
  "Make the buyer the owner": "I have made the buyer the owner",
  "Confirm ownership received": "The channel is mine",
  "Add the buyer as manager": "I have added the buyer",
  "Make the buyer primary owner": "I have made the buyer primary owner",
  "Release the seller's funds": "Release the funds",
};

/**
 * The presses that decide where the money and the channel go, which ask
 * once more before they count. Received above all: pressed by mistake, the
 * seller's channel goes to a buyer who has not paid, and cannot come back.
 */
const CONFIRM_FIRST: Readonly<Record<string, string>> = {
  "Pay the seller":
    "Only once you have sent the money. The seller is asked to confirm it arrived, and the moment you press this is the record.",
  "Confirm the payment arrived":
    "Only if the money is in your account. Once you press it our agent hands the channel to the buyer, and it cannot come back to you.",
};

export function confirmFirst(label: string): string | undefined {
  return CONFIRM_FIRST[label];
}

/** The second press, in words that say what is being sworn to. */
const CONFIRM_YES: Readonly<Record<string, string>> = {
  "Pay the seller": "Yes, I have sent it",
  "Confirm the payment arrived": "Yes, it arrived",
};

export function confirmYes(label: string): string {
  return CONFIRM_YES[label] ?? `Yes, ${confirmLabel(label)}`;
}

/** What the step's button says. */
export function confirmLabel(label: string): string {
  return CONFIRM_LABELS[label] ?? "Mark this done";
}

export function stepHelp(mode: DealMode, label: string): string | undefined {
  return STEP_HELP[mode][label];
}
