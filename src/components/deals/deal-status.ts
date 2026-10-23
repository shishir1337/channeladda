import type { DealMode, OrderStatus, Platform } from "@/generated/prisma/enums";
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
 * Channel Adda wallet once our agent is the channel's primary owner; our agent
 * then makes the buyer primary owner. On Safest our agent holds the channel
 * first, and only then does the buyer pay the seller directly — Channel Adda
 * takes the admin fee and nothing else.
 */

export type StatusTone = "neutral" | "info" | "verified" | "danger";

/**
 * Viewer-neutral on purpose. The label this replaces said "your payment",
 * which read as a lie to the seller looking at the same deal.
 */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  AWAITING_PAYMENT: "Waiting for the buyer's payment",
  AGENT_VERIFYING: "Handing the channel to our agent",
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
  AGENT_VERIFYING: "Handing over to us",
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
 * The few words that depend on the platform.
 *
 * On YouTube the account our agent is invited with is a Google account, and
 * Google makes a new owner wait 7 days before they can be made primary owner.
 * Neither is true anywhere else, and a Telegram seller told to wait for
 * Google was told something false.
 */
type Words = {
  /** "Google account" on YouTube, "account" elsewhere. */
  account: string;
  /** Google's 7-day wait applies. */
  googleWait: boolean;
};

function wordsFor(platform: Platform): Words {
  const youtube = platform === "YOUTUBE";
  return {
    account: youtube ? "Google account" : "account",
    googleWait: youtube,
  };
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
          : "Nothing starts until your payment reaches Channel Adda. We hold it until our agent has the channel, and our agent then makes you primary owner.";
      }
      if (viewer === "seller") {
        return "The buyer has not paid yet. Your channel stays with you, and nothing is asked of you until they do.";
      }
      return "The buyer has not paid yet, so no step has opened.";

    case "AGENT_VERIFYING":
      if (viewer === "buyer") {
        return "Channel Adda is holding your payment. The seller is inviting our agent as owner of the channel, and our agent then invites you.";
      }
      if (viewer === "seller") {
        return "Invite our agent as owner of the channel. The account to invite is on this page. The buyer's payment is with Channel Adda in the meantime.";
      }
      return "The seller is inviting you as owner of the channel.";

    case "AWAITING_CUSTODY":
      if (viewer === "buyer") {
        return "The seller is handing the channel to our agent. You have paid our fee and nothing else — you pay the seller only once our agent holds the channel.";
      }
      if (viewer === "seller") {
        return "Invite our agent as owner of the channel. The account to invite is on this page.";
      }
      return "The seller is inviting you as owner of the channel.";

    case "IN_CUSTODY":
      if (safest) {
        if (viewer === "buyer") {
          return "Our agent holds the channel now, not the seller. Pay the seller the price directly, to the details they gave on this page, then press Paid.";
        }
        if (viewer === "seller") {
          return "Our agent holds the channel. The buyer pays you directly next, to the details you gave on this page.";
        }
        return "You hold this channel. The buyer pays the seller directly next.";
      }
      if (viewer === "buyer") {
        return "Our agent is primary owner and the seller has been paid. Our agent makes you primary owner next.";
      }
      if (viewer === "seller") {
        return "Our agent holds the channel and your money is in your Channel Adda wallet. Nothing more is needed from you.";
      }
      return "You are primary owner and the seller has been paid. Make the buyer primary owner, using the account on this page.";

    case "AWAITING_BUYER_PAYMENT":
    case "AWAITING_RELEASE":
      // Only a deal opened under an earlier set of steps can be here, and
      // its steps are not this page's any more.
      return "This deal began under our earlier steps. Channel Adda will finish it with you in the chat.";

    case "AWAITING_HANDOVER":
      if (safest) {
        if (viewer === "buyer") {
          return "The seller confirmed your payment. Our agent is transferring the channel to you.";
        }
        if (viewer === "seller") {
          return "You confirmed the buyer's payment, so your part is done. Our agent is transferring the channel to the buyer.";
        }
        return "Transfer ownership to the buyer, using the account on this page.";
      }
      if (viewer === "buyer") {
        return "Accept our agent's owner invite if you have not yet. After the holding period our agent becomes primary owner, the seller is paid, and our agent makes you primary owner.";
      }
      if (viewer === "seller") {
        return "When the holding period ends, make our agent primary owner of the channel. That is when you are paid. We email you the moment you can.";
      }
      return "The holding period, then the seller makes you primary owner.";

    case "COMPLETED":
      if (viewer === "buyer") return "Finished. The channel is yours.";
      if (viewer === "seller") {
        return safest
          ? "Finished. The channel is the buyer's, and the buyer paid you directly."
          : "Finished. Channel Adda paid your money into your Channel Adda wallet.";
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

type Reader = "buyer" | "seller";

type Override = {
  label: string;
  /** The badge for the buyer or the seller, where the neutral one would name them. */
  labelFor?: Partial<Record<Reader, string>>;
  short: string;
  sentence: (w: Words) => Record<"buyer" | "seller" | "agent", string>;
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
    label: "Our agent is accepting the invite",
    short: "Agent accepting",
    sentence: (w) => ({
      buyer: w.googleWait
        ? "The seller has invited our agent as owner. Our agent accepts it next, and then Google's 7-day wait starts."
        : "The seller has invited our agent as owner. Our agent accepts it next.",
      seller: w.googleWait
        ? "You have invited our agent, so your part is done for now. They accept it next, and then Google's 7-day wait starts."
        : "You have invited our agent, so your part is done for now. They accept it next.",
      agent: w.googleWait
        ? "The seller has invited you as owner. Accept it, then confirm here — that starts Google's 7-day wait."
        : "The seller has invited you as owner. Accept it, then confirm here.",
    }),
  },
  "SAFEST:AWAITING_CUSTODY:4": {
    label: "Our agent becomes primary owner next",
    short: "Agent to primary",
    sentence: (w) => ({
      buyer: w.googleWait
        ? "Our agent is an owner. After Google's 7-day wait, the seller makes our agent primary owner."
        : "Our agent is an owner. The seller makes them primary owner next.",
      seller: w.googleWait
        ? "When Google's 7-day wait ends, make our agent primary owner of the channel. We email you the moment you can."
        : "Make our agent primary owner of the channel.",
      agent: w.googleWait
        ? "Google's 7-day wait, then the seller makes you primary owner."
        : "The seller makes you primary owner next.",
    }),
  },
  "SAFEST:AWAITING_CUSTODY:5": {
    label: "Our agent is verifying the channel",
    short: "Agent verifying",
    sentence: () => ({
      buyer:
        "Our agent is primary owner and is checking ownership, monetization and strikes. The latest proof comes to you in the deal chat, then you pay the seller.",
      seller:
        "You have made our agent primary owner. They verify the channel next, then the buyer pays you.",
      agent:
        "You are primary owner. Check ownership, monetization, strikes and that the channel is genuine, post the latest proof in the deal chat, then confirm here.",
    }),
  },
  "SAFEST:IN_CUSTODY:6": {
    label: "Waiting for the buyer to pay the seller",
    labelFor: {
      buyer: "Pay the seller now",
      seller: "Waiting for the buyer to pay you",
    },
    short: "Buyer paying",
    sentence: () => ({
      buyer:
        "Our agent holds the channel now, not the seller. Pay the seller the price directly, to the details they gave on this page, then press Paid.",
      seller:
        "Our agent holds the channel. The buyer pays you directly next, to the details you gave on this page.",
      agent: "You hold the channel. The buyer is paying the seller directly.",
    }),
  },
  "SAFEST:IN_CUSTODY:7": {
    label: "Waiting for the seller to confirm the payment",
    labelFor: { seller: "Confirm the buyer's payment" },
    short: "Seller confirming",
    sentence: () => ({
      buyer:
        "You have marked it paid. Once the seller confirms the money arrived, our agent transfers the channel to you.",
      seller:
        "The buyer says they have paid you. When the money is in your account, press Received. If it has not arrived, say so in the deal chat.",
      agent:
        "The buyer says they have paid. Waiting for the seller to confirm it arrived.",
    }),
  },
  "SAFEST:AWAITING_HANDOVER:8": {
    label: "Our agent is transferring the channel",
    short: "Transferring",
    sentence: () => ({
      buyer:
        "The seller confirmed your payment. Our agent is transferring ownership to the account you gave.",
      seller:
        "You confirmed the buyer's payment, so your part is done. Our agent is transferring the channel to the buyer.",
      agent:
        "Transfer ownership to the buyer, using the account on this page. That completes the deal.",
    }),
  },
  "FASTEST:AGENT_VERIFYING:2": {
    label: "Waiting for the seller to invite our agent",
    labelFor: { seller: "Invite our agent now" },
    short: "Seller inviting",
    sentence: () => ({
      buyer:
        "Channel Adda is holding your payment. The seller is inviting our agent as owner of the channel.",
      seller:
        "Invite our agent as owner of the channel. The account to invite is on this page. The buyer's payment is with Channel Adda in the meantime.",
      agent: "The seller is inviting you as owner of the channel.",
    }),
  },
  "FASTEST:AGENT_VERIFYING:3": {
    label: "Our agent is inviting the buyer",
    short: "Agent inviting",
    sentence: () => ({
      buyer:
        "The seller has invited our agent. Our agent accepts and invites your account as owner next — that starts the holding period.",
      seller:
        "You have invited our agent, so your part is done for now. They invite the buyer next, and then the holding period starts.",
      agent:
        "The seller has invited you. Accept it, invite the buyer's account on this page as owner, then confirm here — that starts the holding period.",
    }),
  },
  "FASTEST:AWAITING_HANDOVER:4": {
    label: "Our agent becomes primary owner next",
    short: "Agent to primary",
    sentence: () => ({
      buyer:
        "Accept our agent's owner invite if you have not yet. When the holding period ends, the seller makes our agent primary owner and is paid, and our agent then makes you primary owner.",
      seller:
        "When the holding period ends, make our agent primary owner of the channel. That is when you are paid. We email you the moment you can.",
      agent: "The holding period, then the seller makes you primary owner.",
    }),
  },
  "FASTEST:AWAITING_HANDOVER:5": {
    label: "Our agent is confirming ownership",
    short: "Agent confirming",
    sentence: () => ({
      buyer:
        "The seller says our agent is primary owner. Our agent confirms it, the seller is paid, and then you are made primary owner.",
      seller:
        "You have made our agent primary owner. Once they confirm it, your money reaches your Channel Adda wallet.",
      agent:
        "The seller says you are primary owner. Confirm once you are — that pays the seller.",
    }),
  },
  "FASTEST:IN_CUSTODY:6": {
    label: "Our agent is transferring the channel",
    short: "Transferring",
    sentence: () => ({
      buyer:
        "Our agent is primary owner and the seller has been paid. Our agent makes you primary owner next.",
      seller:
        "Our agent holds the channel and your money is in your Channel Adda wallet. Your part is done.",
      agent:
        "You are primary owner and the seller has been paid. Make the buyer primary owner, using the account on this page. That completes the deal.",
    }),
  },
};

/**
 * The status badge for the buyer or the seller, where the neutral wording
 * would talk about them in the third person ("the buyer's payment", read by
 * the buyer). Staff and the agent keep STATUS_LABELS.
 */
const PERSONAL_LABELS: Partial<
  Record<OrderStatus, Partial<Record<Reader, string>>>
> = {
  AWAITING_PAYMENT: {
    buyer: "Waiting for your payment",
    seller: "Waiting for the buyer to pay",
  },
  // Only step 2 reaches this: steps 3 to 5 have their own copy above.
  AWAITING_CUSTODY: { seller: "Invite our agent now" },
  AWAITING_BUYER_PAYMENT: {
    buyer: "Pay the seller now",
    seller: "Waiting for the buyer to pay you",
  },
  AWAITING_RELEASE: { seller: "Paying you" },
  RETURNED_TO_SELLER: { seller: "Channel returned to you" },
};

function isReader(viewer: DealActor): viewer is Reader {
  return viewer === "buyer" || viewer === "seller";
}

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
  platform: Platform,
  /** The open step waits for Channel Adda to assign an agent. */
  awaitingAgent = false,
): DealHeadline {
  if (awaitingAgent) {
    return {
      label: "Channel Adda is assigning an agent",
      short: "Assigning an agent",
      sentence:
        viewer === "seller"
          ? "Channel Adda is assigning an agent to run this deal. You will be told the account to invite as soon as they join."
          : viewer === "buyer"
            ? "Your payment is with Channel Adda. We are assigning an agent to run the deal, and the seller invites them next."
            : "This deal is waiting for an agent.",
    };
  }
  const override =
    openStep === null
      ? undefined
      : BY_OPEN_STEP[`${mode}:${status}:${openStep}`];
  if (override) {
    const reader =
      viewer === "buyer" || viewer === "seller" ? viewer : ("agent" as const);
    return {
      label:
        (isReader(viewer) ? override.labelFor?.[viewer] : undefined) ??
        override.label,
      short: override.short,
      sentence: override.sentence(wordsFor(platform))[reader],
    };
  }
  return {
    label:
      (isReader(viewer) ? PERSONAL_LABELS[status]?.[viewer] : undefined) ??
      STATUS_LABELS[status],
    short: STATUS_SHORT[status],
    sentence: statusSentence(status, mode, viewer),
  };
}

/**
 * Where the money is, in one line, for this reader.
 *
 * Fastest holds the buyer's money with Channel Adda until our agent is the
 * channel's primary owner, then pays the seller. Safest holds the channel
 * instead: our agent takes it, and only then does the buyer pay the seller
 * directly — Channel Adda takes the admin fee and nothing else.
 */
export function moneyNote(
  mode: DealMode,
  viewer: DealActor,
  /** Fastest: our agent is primary owner, so the seller has been paid. */
  sellerPaid = false,
): string {
  if (mode === "FASTEST" && sellerPaid) {
    if (viewer === "buyer") {
      return "The seller has been paid from your payment, and our agent holds the channel. Our agent makes you primary owner next.";
    }
    if (viewer === "seller") {
      return "You have been paid: the money is in your Channel Adda wallet. Our agent holds the channel and hands it to the buyer.";
    }
    return "The seller has been paid and you hold the channel. Make the buyer primary owner to finish the deal.";
  }
  if (mode === "SAFEST") {
    if (viewer === "buyer") {
      return "You pay Channel Adda only our fee. The channel's price you pay the seller directly, once our agent holds the channel — so the seller cannot take your money and keep the channel.";
    }
    if (viewer === "seller") {
      return "The buyer pays you directly, once our agent holds the channel. Our agent transfers it to the buyer only after you confirm the money arrived. Channel Adda takes its fee from the buyer.";
    }
    return "Channel Adda takes only the admin fee. The buyer pays the seller directly while our agent holds the channel, and the transfer waits for the seller's Received.";
  }
  if (viewer === "buyer") {
    return "Channel Adda holds the price and the fee together. The seller is paid only once our agent is the channel's primary owner, and our agent then makes you primary owner.";
  }
  if (viewer === "seller") {
    return "Channel Adda is holding the buyer's payment, and pays it into your Channel Adda wallet as soon as our agent is primary owner of the channel.";
  }
  return "Channel Adda holds the whole amount until you are primary owner, then pays the seller.";
}

/** The deal's running hold, on the step it is holding back. */
export function holdNote(mode: DealMode, platform: Platform): string {
  if (mode === "SAFEST") {
    return "Google makes a new owner wait 7 days before they can be made primary owner. There is nothing to do but wait — we email you the moment it ends.";
  }
  return platform === "YOUTUBE"
    ? "The holding period runs while our agent and the buyer are owners — it is also Google's 7-day wait before our agent can be made primary owner. There is nothing to do until then — we email you the moment it ends."
    : "The holding period runs while our agent and the buyer have the channel's access. There is nothing to do until then — we email you the moment it ends.";
}

/**
 * What each step actually involves, in words a first-time seller can act on.
 *
 * Keyed by mode and then by the step labels in `@/lib/deal-templates`: the
 * two deals share a label or two that mean different things. An unknown
 * label gets no explanation rather than a wrong one, so adding a step to a
 * template can never make this file lie.
 */
const STEP_HELP: Readonly<
  Record<DealMode, Record<string, (w: Words) => string>>
> = {
  SAFEST: {
    "Pay the admin fee": () =>
      "Channel Adda's fee, to start, and the only payment Channel Adda takes on this deal. The channel's price goes to the seller directly, once our agent holds the channel.",
    "Invite the agent as owner": (w) =>
      `The seller invites our agent's ${w.account}, shown on this page, as an owner of the channel.`,
    "Accept the owner invite": (w) =>
      w.googleWait
        ? "Our agent accepts the invite. That starts Google's 7-day wait before an owner can be made primary owner."
        : "Our agent accepts the invite.",
    "Make the agent primary owner": (w) =>
      w.googleWait
        ? "Once Google's 7-day wait is over, the seller makes our agent the channel's primary owner. We email the seller the moment they can."
        : "The seller makes our agent the channel's primary owner.",
    "Verify the channel": () =>
      "Our agent confirms they are primary owner, checks ownership, monetization, strikes and that the channel is genuine, and posts the latest proof in the deal chat for the buyer. From here the channel is out of the seller's hands.",
    "Pay the seller": () =>
      "The buyer pays the seller the price directly, to the details the seller gave on this page — crypto, bank, bKash, whatever they agreed — then presses Paid. Put the transaction id or a screenshot in the chat: it is your proof.",
    "Confirm the payment arrived": () =>
      "The seller presses Received once the money is in their account. Only then does our agent transfer the channel. If it has not arrived, say so in the chat and a moderator will look.",
    "Transfer ownership to the buyer": () =>
      "Our agent transfers ownership to the buyer's account, named on this page. That completes the deal.",
  },
  FASTEST: {
    "Pay the full amount": () =>
      "The channel's price and our fee together. Channel Adda holds all of it until our agent has the channel.",
    "Invite the agent as owner": (w) =>
      `The seller invites our agent's ${w.account}, shown on this page, as an owner of the channel.`,
    "Invite the buyer as owner": (w) =>
      w.googleWait
        ? "Our agent accepts the seller's invite and invites the buyer's account, named on this page, as an owner. That starts the holding period, shown in the chat — Google's 7-day wait before our agent can be made primary owner runs at the same time."
        : "Our agent accepts the seller's invite and gives the buyer's account, named on this page, access to the channel. That starts the holding period, shown in the chat.",
    "Make the agent primary owner": () =>
      "When the holding period ends, the seller makes our agent the channel's primary owner. We email the seller the moment they can.",
    "Confirm primary ownership": () =>
      "Our agent confirms they are primary owner. The channel is out of the seller's hands, so Channel Adda pays the seller into their Channel Adda wallet now.",
    "Make the buyer primary owner": () =>
      "Our agent makes the buyer's account primary owner and leaves the channel. That completes the deal.",
  },
};

/** Clearer than "Mark this done" where the step is a statement of fact. */
const CONFIRM_LABELS: Readonly<Record<string, string>> = {
  "Invite the agent as owner": "I have invited the agent",
  "Accept the owner invite": "I have accepted it",
  "Make the agent primary owner": "I have made the agent primary owner",
  "Verify the channel": "The channel checks out",
  // The client's own words for the two that are the record of the price.
  "Pay the seller": "Paid",
  "Confirm the payment arrived": "Received",
  "Transfer ownership to the buyer": "I have transferred it",
  "Invite the buyer as owner": "I have invited the buyer",
  "Confirm primary ownership": "I am the primary owner",
  "Make the buyer primary owner": "I have made the buyer primary owner",
};

/**
 * The presses that decide where the money and the channel go, which ask
 * once more before they count, keyed `MODE:label`. Received above all:
 * pressed by mistake, the seller's channel goes to a buyer who has not
 * paid, and cannot come back. Our agent's last press ends the deal, and on
 * Fastest their custody pays the seller.
 */
const CONFIRM_FIRST: Readonly<Record<string, string>> = {
  "SAFEST:Verify the channel":
    "Only once ownership, monetization and strikes check out and you have posted the latest proof in the deal chat. The buyer pays the seller next.",
  "SAFEST:Pay the seller":
    "Only once you have sent the money. The seller is asked to confirm it arrived, and the moment you press this is the record.",
  "SAFEST:Confirm the payment arrived":
    "Only if the money is in your account. Once you press it our agent transfers the channel to the buyer, and it cannot come back to you.",
  "SAFEST:Transfer ownership to the buyer":
    "Only once the buyer's account owns the channel. This completes the deal, and cannot be undone.",
  "FASTEST:Confirm primary ownership":
    "Only once you are the channel's primary owner. This pays the seller from the buyer's money, and cannot be undone.",
  "FASTEST:Make the buyer primary owner":
    "Only once the buyer's account is primary owner. This completes the deal, and cannot be undone.",
};

export function confirmFirst(
  mode: DealMode,
  label: string,
): string | undefined {
  return CONFIRM_FIRST[`${mode}:${label}`];
}

/** The second press, in words that say what is being sworn to. */
const CONFIRM_YES: Readonly<Record<string, string>> = {
  "Verify the channel": "Yes, it checks out",
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

export function stepHelp(
  mode: DealMode,
  label: string,
  platform: Platform,
): string | undefined {
  return STEP_HELP[mode][label]?.(wordsFor(platform));
}
