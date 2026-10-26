import type { BadgeVariant } from "@/components/ui/badge";
import type { DealMode, OrderStatus, Platform } from "@/generated/prisma/enums";
import type { DealActor } from "@/lib/deal-machine";
import { templateFor } from "@/lib/deal-templates";

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
 * Channel Adda wallet once our agent has full control; our agent then hands
 * it to the buyer. On Safest our agent holds it first, and only then does
 * the buyer pay the seller directly — Channel Adda takes the admin fee and
 * nothing else.
 */

export type StatusTone = BadgeVariant;

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
  // Waiting on a payment: gold, the colour of "somebody's move".
  AWAITING_PAYMENT: "primary",
  AWAITING_BUYER_PAYMENT: "primary",
  // The seller handing over to us: blue, in progress.
  AGENT_VERIFYING: "info",
  AWAITING_CUSTODY: "info",
  AWAITING_RELEASE: "info",
  // The channel in our hands, on its way to the buyer: violet.
  IN_CUSTODY: "accent",
  AWAITING_HANDOVER: "accent",
  // Endings, each in its own colour.
  COMPLETED: "success",
  PAYMENT_EXPIRED: "warning",
  CANCELLED: "danger",
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

// ---------------------------------------------------------------------------
// The words that depend on the platform
// ---------------------------------------------------------------------------

/**
 * How each platform's account actually changes hands.
 *
 * The step labels are YouTube's — "invite as owner", "primary owner" — and
 * they are stored on every running deal, so they stay. What is shown comes
 * from here instead: on Instagram the seller hands over the login and our
 * agent moves its email, phone and two-factor to Channel Adda; on Facebook
 * the seller adds our agent to the Page with full control and leaves it; on
 * Telegram our agent is made an admin and then owner; a website moves by its
 * domain and hosting. An Instagram seller told to "invite our agent as
 * owner" was told to look for a button that does not exist.
 */
export type Words = {
  platform: Platform;
  /** "Google account" on YouTube, "account" elsewhere. */
  account: string;
  /** Google's 7-day wait applies. */
  googleWait: boolean;
  /** What is being sold: "channel", "account", "Page", "website". */
  asset: string;
  /** Where the seller finds what they hand it to. */
  agentOnPage: string;
  /** The card that shows the seller our agent's account. */
  agentCard: { invite: string; primary: string };
  /** What the buyer accepts after our agent gives them access, if anything. */
  buyerAccept: string | null;
  /** The buyer's badge on the step that hands it to them. */
  buyerNext: string;
};

const WORDS: Readonly<Record<Platform, Omit<Words, "platform">>> = {
  YOUTUBE: {
    account: "Google account",
    googleWait: true,
    asset: "channel",
    agentOnPage: "The account to invite is on this page.",
    agentCard: {
      invite: "Invite this account as owner",
      primary: "Make this account primary owner",
    },
    buyerAccept: "Accept our agent's owner invite if you have not yet.",
    buyerNext: "You become primary owner next",
  },
  INSTAGRAM: {
    account: "account",
    googleWait: false,
    asset: "account",
    agentOnPage:
      "Our agent's email, which the account moves to, is on this page.",
    agentCard: {
      invite: "The account moves to this email",
      primary: "The account moves to this email",
    },
    buyerAccept: null,
    buyerNext: "The account moves to you next",
  },
  FACEBOOK: {
    account: "Facebook account",
    googleWait: false,
    asset: "Page",
    agentOnPage: "Our agent's Facebook account is on this page.",
    agentCard: {
      invite: "Add this account to the Page",
      primary: "Leave the Page to this account",
    },
    buyerAccept: "Accept our agent's Page invite if you have not yet.",
    buyerNext: "You get full control next",
  },
  TELEGRAM: {
    account: "Telegram account",
    googleWait: false,
    asset: "channel",
    agentOnPage: "Our agent's Telegram account is on this page.",
    agentCard: {
      invite: "Make this account an admin",
      primary: "Transfer ownership to this account",
    },
    buyerAccept: null,
    buyerNext: "You become the owner next",
  },
  WEBSITE: {
    account: "email",
    googleWait: false,
    asset: "website",
    agentOnPage: "Our agent's email is on this page.",
    agentCard: {
      invite: "Give this email access",
      primary: "Transfer the domain to this email",
    },
    buyerAccept: null,
    buyerNext: "The website moves to you next",
  },
};

export function wordsFor(platform: Platform): Words {
  return { platform, ...WORDS[platform] };
}

/** Who a step's words are about, from where the reader stands. */
type Them = {
  agent: string;
  agentPoss: string;
  /** "you are" / "they are", for our agent. */
  agentIs: string;
  buyer: string;
  buyerPoss: string;
  seller: string;
  sellerPoss: string;
};

function them(reader: DealActor): Them {
  return {
    agent: reader === "agent" ? "you" : "our agent",
    agentPoss: reader === "agent" ? "your" : "our agent's",
    agentIs: reader === "agent" ? "you are" : "they are",
    buyer: reader === "buyer" ? "you" : "the buyer",
    buyerPoss: reader === "buyer" ? "your" : "the buyer's",
    seller: reader === "seller" ? "you" : "the seller",
    sellerPoss: reader === "seller" ? "your" : "their",
  };
}

/**
 * One step, in every form it is shown in.
 *
 * `to` is the step as an instruction ("invite our agent as owner"), with
 * its objects from the reader's side, so the same words read "The seller
 * invites you as owner" to our agent and "You invite our agent as owner" to
 * the seller. Every form starts with its verb, which is how the third person
 * and the "-ing" form are made from it.
 */
type Act = {
  to: (o: Them) => string;
  /** Shorter, for a badge: "invite our agent". Defaults to `to`. */
  ask?: (o: Them) => string;
  /** After a name, in the deal chat's record: "invited our agent as owner". */
  did: string;
  /** What it involves, to whoever does it. */
  how: string;
  /** What it involves, to anybody watching. */
  what: (o: Them) => string;
  /** The button. */
  button: string;
  /** A name that reads better for one reader than the made one. */
  titles?: Partial<Record<"buyer" | "seller" | "agent" | "staff", string>>;
  /** Asked once more before the press counts. */
  caution?: string;
};

/** The steps that are about money, the same on every platform. */
function moneyActs(w: Words): Record<string, Act> {
  return {
    "Pay the admin fee": {
      to: () => "pay our fee",
      did: "paid our fee",
      how: `Channel Adda's fee, to start — the only payment Channel Adda takes on this deal. You pay the price to the seller directly, once our agent holds the ${w.asset}.`,
      what: () =>
        `The buyer pays Channel Adda's fee to start. The price goes to the seller directly, once our agent holds the ${w.asset}.`,
      button: "Mark this done",
    },
    "Pay the full amount": {
      to: () => "pay",
      did: "paid",
      how: `The price and our fee together. Channel Adda holds all of it until our agent has the ${w.asset}.`,
      what: () =>
        `The buyer pays the price and our fee to Channel Adda, which holds it until our agent has the ${w.asset}.`,
      button: "Mark this done",
      titles: {
        seller: "The buyer pays us",
        agent: "The buyer pays us",
        staff: "The buyer pays us",
      },
    },
    "Pay the seller": {
      to: (o) => `pay ${o.seller}`,
      did: "marked the price as paid",
      how: "Pay the seller the price directly, to the details the seller gave on this page, then press Paid. Put the transaction id or a screenshot in the deal chat: it is your proof.",
      what: (o) =>
        `The buyer pays ${o.seller} the price directly, to the details ${o.seller === "you" ? "you" : "the seller"} gave on this page, then presses Paid. The proof goes in the deal chat.`,
      button: "Paid",
      caution:
        "Only once you have sent the money. The seller is asked to confirm it arrived, and the moment you press this is the record.",
    },
    "Confirm the payment arrived": {
      to: (o) => `confirm ${o.buyerPoss} payment arrived`,
      did: "confirmed the payment arrived",
      how: `Press Received once the money is in your account. Only then does our agent hand the ${w.asset} to the buyer. If it has not arrived, say so in the deal chat and a moderator will look.`,
      what: (o) =>
        `The seller presses Received once the money is in their account. Only then does our agent hand the ${w.asset} to ${o.buyer}.`,
      button: "Received",
      caution: `Only if the money is in your account. Once you press it our agent hands the ${w.asset} to the buyer, and it cannot come back to you.`,
    },
    // Safest's last step before 2026-10-25, on the deals finished with it.
    "Transfer ownership to the buyer": {
      to: (o) => `hand the ${w.asset} to ${o.buyer}`,
      did: "handed it to the buyer",
      how: "You transferred ownership to the buyer's account. That completed the deal.",
      what: () =>
        "Our agent transferred ownership to the buyer's account. That completed the deal.",
      button: "I have transferred it",
    },
  };
}

/** What closes every hand-over step, by mode. */
const PAID_WHEN = "That is when you are paid.";

function youtubeActs(m: DealMode): Record<string, Act> {
  return {
    "Invite the agent as owner": {
      to: (o) => `invite ${o.agent} as owner`,
      ask: (o) => `invite ${o.agent}`,
      did: "invited our agent as owner",
      how: "Invite our agent's Google account, shown on this page, as an owner of the channel.",
      what: (o) =>
        `The seller invites ${o.agentPoss} Google account as an owner of the channel.`,
      button: "I have invited the agent",
    },
    "Accept the owner invite": {
      to: () => "accept the owner invite",
      did: "accepted the owner invite",
      how: "Accept the seller's invite. That starts Google's 7-day wait before you can be made primary owner.",
      what: () =>
        "Our agent accepts the seller's invite. That starts Google's 7-day wait before an owner can be made primary owner.",
      button: "I have accepted it",
    },
    "Invite the buyer as owner": {
      to: (o) => `invite ${o.buyer} as owner`,
      ask: (o) => `invite ${o.buyer}`,
      did: "invited the buyer as owner",
      how:
        m === "FASTEST"
          ? "Accept the seller's invite, then invite the buyer's Google account, named on this page, as an owner. That starts the holding period, which is also Google's 7-day wait before you can be made primary owner."
          : "Invite the buyer's Google account, named on this page, as an owner. That starts Google's 7-day wait before they can be made primary owner.",
      what: (o) =>
        m === "FASTEST"
          ? `Our agent accepts the seller's invite and invites ${o.buyerPoss} Google account, named on this page, as an owner. That starts the holding period.`
          : `Our agent invites ${o.buyerPoss} Google account, named on this page, as an owner. That starts Google's 7-day wait before ${o.buyer === "you" ? "you" : "they"} can be made primary owner.`,
      button: "I have invited the buyer",
    },
    "Make the agent primary owner": {
      to: (o) => `make ${o.agent} primary owner`,
      did: "made our agent primary owner",
      how:
        m === "FASTEST"
          ? `Make our agent's Google account primary owner of the channel. ${PAID_WHEN}`
          : "Make our agent's Google account primary owner of the channel.",
      what: (o) =>
        m === "FASTEST"
          ? `The seller makes ${o.agent} primary owner of the channel. That is when the seller is paid.`
          : `The seller makes ${o.agent} primary owner of the channel.`,
      button: "I have made the agent primary owner",
      caution:
        m === "FASTEST"
          ? "Only once our agent's account is primary owner. Our agent confirms it next, and that is when you are paid. You cannot take the channel back."
          : "Only once our agent's account is primary owner. Our agent checks the channel next, and you cannot take it back.",
    },
    "Confirm primary ownership": {
      to: (o) => `confirm ${o.agentIs} primary owner`,
      did: "confirmed primary ownership",
      how: "Confirm once you are the channel's primary owner. That pays the seller from the buyer's money.",
      what: (o) =>
        `Our agent confirms they are primary owner. Channel Adda then pays ${o.seller} into ${o.sellerPoss} Channel Adda wallet.`,
      button: "I am the primary owner",
      titles: {
        buyer: "Our agent confirms they own it",
        seller: "Our agent confirms, and you are paid",
      },
      caution:
        "Only once you are the channel's primary owner. This pays the seller from the buyer's money, and cannot be undone.",
    },
    "Verify the channel": {
      to: () => "check the channel",
      did: "checked the channel",
      how: "Check you are primary owner, then the monetization, the strikes and that the channel is genuine. Post the latest proof in the deal chat, then confirm here.",
      what: () =>
        "Our agent checks they are primary owner, the monetization, the strikes and that the channel is genuine, and posts the latest proof in the deal chat. From here the channel is out of the seller's hands.",
      button: "The channel checks out",
      caution:
        "Only once ownership, monetization and strikes check out and you have posted the latest proof in the deal chat. The buyer pays the seller next.",
    },
    "Make the buyer primary owner": {
      to: (o) => `make ${o.buyer} primary owner`,
      did: "made the buyer primary owner",
      how: "Make the buyer's Google account, named on this page, primary owner, then leave the channel. That completes the deal.",
      what: (o) =>
        `Our agent makes ${o.buyerPoss} Google account primary owner and leaves the channel. That completes the deal.`,
      button: "I have made the buyer primary owner",
      caution:
        "Only once the buyer's account is primary owner. This completes the deal, and cannot be undone.",
    },
  };
}

function instagramActs(m: DealMode): Record<string, Act> {
  const secure: Act = {
    to: () => "secure the login",
    did: "secured the login",
    how:
      m === "FASTEST"
        ? "Sign in, move the email and phone to Channel Adda's, change the password and turn on two-factor, so the seller can no longer sign in. That starts the holding period."
        : "Sign in, move the email and phone to Channel Adda's, change the password and turn on two-factor, so the seller can no longer sign in.",
    what: () =>
      m === "FASTEST"
        ? "Our agent signs in, moves the email and phone to Channel Adda's, changes the password and turns on two-factor. That starts the holding period."
        : "Our agent signs in, moves the email and phone to Channel Adda's, changes the password and turns on two-factor.",
    button: "I have secured it",
  };
  return {
    "Invite the agent as owner": {
      to: (o) => `send ${o.agent} the login`,
      did: "sent our agent the login",
      how: "Send our agent the account's username and password in the deal chat, and the login code when they ask for it.",
      what: (o) =>
        `The seller sends ${o.agent} the account's username and password.`,
      button: "I have sent the login",
    },
    "Accept the owner invite": secure,
    // Fastest: our agent secures it before the holding period. Safest: the
    // seller has been paid, and the buyer gets the login.
    "Invite the buyer as owner":
      m === "FASTEST"
        ? secure
        : {
            to: (o) => `send ${o.buyer} the login`,
            did: "sent the buyer the login",
            how: "Send the buyer the username and password in the deal chat, so they can sign in and check the account.",
            what: (o) =>
              `Our agent sends ${o.buyer} the username and password in the deal chat.`,
            button: "I have sent the login",
          },
    "Make the agent primary owner": {
      to: () => "unlink the account from Meta",
      did: "unlinked the account from Meta",
      how:
        m === "FASTEST"
          ? `In Meta Accounts Center, remove this account from yours, and take off any email or phone of yours still on it. ${PAID_WHEN}`
          : "In Meta Accounts Center, remove this account from yours, and take off any email or phone of yours still on it.",
      what: () =>
        m === "FASTEST"
          ? "The seller removes the account from their Meta Accounts Center. That is when the seller is paid."
          : "The seller removes the account from their Meta Accounts Center.",
      button: "I have unlinked it",
      caution:
        m === "FASTEST"
          ? "Only once the account is out of your Meta Accounts Center. Our agent checks it next, and that is when you are paid. You cannot take the account back."
          : "Only once the account is out of your Meta Accounts Center. Our agent checks it next, and you cannot take it back.",
    },
    "Confirm primary ownership": {
      to: () => "confirm only Channel Adda can sign in",
      did: "confirmed only Channel Adda can sign in",
      how: "Check the email, phone and two-factor are Channel Adda's and nothing links the account to the seller. Confirming pays the seller from the buyer's money.",
      what: (o) =>
        `Our agent checks only Channel Adda can sign in. Channel Adda then pays ${o.seller} into ${o.sellerPoss} Channel Adda wallet.`,
      button: "Only we can sign in",
      titles: { seller: "Our agent confirms, and you are paid" },
      caution:
        "Only once nobody but Channel Adda can sign in. This pays the seller from the buyer's money, and cannot be undone.",
    },
    "Verify the channel": {
      to: () => "check the account",
      did: "checked the account",
      how: "Check only you can sign in, that the account is genuine and has no restrictions. Post the latest proof in the deal chat, then confirm here.",
      what: () =>
        "Our agent checks only Channel Adda can sign in and the account has no restrictions, and posts proof in the deal chat. From here the account is out of the seller's hands.",
      button: "The account checks out",
      caution:
        "Only once the account checks out and you have posted the latest proof in the deal chat. The buyer pays the seller next.",
    },
    "Make the buyer primary owner": {
      to: (o) => `move the account to ${o.buyer}`,
      did: "moved the account to the buyer",
      how: "Change the account's email to the buyer's, named on this page, send them the password, and turn off two-factor so they can set their own. That completes the deal.",
      what: (o) =>
        `Our agent changes the account's email to ${o.buyerPoss} email, named on this page, and hands over the password. That completes the deal.`,
      button: "I have moved it to the buyer",
      caution:
        "Only once the email is the buyer's and they have the password. This completes the deal, and cannot be undone.",
    },
  };
}

function facebookActs(m: DealMode): Record<string, Act> {
  return {
    "Invite the agent as owner": {
      to: (o) => `add ${o.agent} to the Page`,
      did: "added our agent to the Page",
      how: "In Meta Business Suite, add our agent's Facebook account, shown on this page, to the Page with full control.",
      what: (o) =>
        `The seller adds ${o.agentPoss} Facebook account to the Page with full control.`,
      button: "I have added the agent",
    },
    "Accept the owner invite": {
      to: () => "accept the Page invite",
      did: "accepted the Page invite",
      how: "Accept the seller's invite to the Page.",
      what: () => "Our agent accepts the seller's invite to the Page.",
      button: "I have accepted it",
    },
    "Invite the buyer as owner": {
      to: (o) => `add ${o.buyer} to the Page`,
      did: "added the buyer to the Page",
      how:
        m === "FASTEST"
          ? "Accept the seller's invite, then add the buyer's Facebook account, named on this page, to the Page with partial access. That starts the holding period."
          : "Add the buyer's Facebook account, named on this page, to the Page with partial access.",
      what: (o) =>
        m === "FASTEST"
          ? `Our agent accepts the seller's invite and adds ${o.buyerPoss} Facebook account to the Page. That starts the holding period.`
          : `Our agent adds ${o.buyerPoss} Facebook account to the Page.`,
      button: "I have added the buyer",
    },
    "Make the agent primary owner": {
      to: () => "leave the Page",
      did: "left the Page",
      how:
        m === "FASTEST"
          ? `Remove yourself from the Page and take it out of your Business Manager, so only our agent has full control. ${PAID_WHEN}`
          : "Remove yourself from the Page and take it out of your Business Manager, so only our agent has full control.",
      what: () =>
        m === "FASTEST"
          ? "The seller leaves the Page and takes it out of their Business Manager. That is when the seller is paid."
          : "The seller leaves the Page and takes it out of their Business Manager.",
      button: "I have left the Page",
      caution:
        m === "FASTEST"
          ? "Only once you have left the Page and its Business Manager. Our agent checks it next, and that is when you are paid. You cannot take the Page back."
          : "Only once you have left the Page and its Business Manager. Our agent checks it next, and you cannot take it back.",
    },
    "Confirm primary ownership": {
      to: () => "confirm full control",
      did: "confirmed full control of the Page",
      how: "Check the seller is gone from the Page and its Business Manager. Confirming pays the seller from the buyer's money.",
      what: (o) =>
        `Our agent checks they alone have full control. Channel Adda then pays ${o.seller} into ${o.sellerPoss} Channel Adda wallet.`,
      button: "I have full control",
      titles: { seller: "Our agent confirms, and you are paid" },
      caution:
        "Only once you alone have full control of the Page. This pays the seller from the buyer's money, and cannot be undone.",
    },
    "Verify the channel": {
      to: () => "check the Page",
      did: "checked the Page",
      how: "Check you alone have full control, then the Page's monetization and any restrictions. Post the latest proof in the deal chat, then confirm here.",
      what: () =>
        "Our agent checks they alone have full control, the monetization and any restrictions, and posts proof in the deal chat. From here the Page is out of the seller's hands.",
      button: "The Page checks out",
      caution:
        "Only once the Page checks out and you have posted the latest proof in the deal chat. The buyer pays the seller next.",
    },
    "Make the buyer primary owner": {
      to: (o) => `give ${o.buyer} full control`,
      did: "gave the buyer full control",
      how: "Give the buyer's Facebook account, named on this page, full control of the Page, then leave it. That completes the deal.",
      what: (o) =>
        `Our agent gives ${o.buyerPoss} Facebook account full control and leaves the Page. That completes the deal.`,
      button: "I have given the buyer full control",
      caution:
        "Only once the buyer's account has full control and you have left the Page. This completes the deal, and cannot be undone.",
    },
  };
}

function telegramActs(m: DealMode): Record<string, Act> {
  return {
    "Invite the agent as owner": {
      to: (o) => `make ${o.agent} an admin`,
      did: "made our agent an admin",
      how: "Add our agent's Telegram account, shown on this page, to the channel as an admin.",
      what: (o) =>
        `The seller adds ${o.agentPoss} Telegram account to the channel as an admin.`,
      button: "I have made the agent an admin",
    },
    "Accept the owner invite": {
      to: (o) => `check ${o.agentIs} an admin`,
      did: "checked their admin access",
      how: "Check you are an admin of the channel, then confirm here.",
      what: () => "Our agent checks they are an admin of the channel.",
      button: "I am an admin",
    },
    "Invite the buyer as owner": {
      to: (o) => `make ${o.buyer} an admin`,
      did: "made the buyer an admin",
      how:
        m === "FASTEST"
          ? "Add the buyer's Telegram username, named on this page, to the channel as an admin. That starts the holding period."
          : "Add the buyer's Telegram username, named on this page, to the channel as an admin.",
      what: (o) =>
        m === "FASTEST"
          ? `Our agent adds ${o.buyerPoss} Telegram account to the channel as an admin. That starts the holding period.`
          : `Our agent adds ${o.buyerPoss} Telegram account to the channel as an admin.`,
      button: "I have made the buyer an admin",
    },
    "Make the agent primary owner": {
      to: (o) => `transfer ownership to ${o.agent}`,
      did: "transferred ownership to our agent",
      how:
        m === "FASTEST"
          ? `In the channel's admin settings, use Transfer Ownership to make our agent the owner. ${PAID_WHEN}`
          : "In the channel's admin settings, use Transfer Ownership to make our agent the owner.",
      what: (o) =>
        m === "FASTEST"
          ? `The seller transfers ownership of the channel to ${o.agent}. That is when the seller is paid.`
          : `The seller transfers ownership of the channel to ${o.agent}.`,
      button: "I have transferred ownership",
      caution:
        m === "FASTEST"
          ? "Only once our agent is the channel's owner. Our agent confirms it next, and that is when you are paid. You cannot take the channel back."
          : "Only once our agent is the channel's owner. Our agent checks it next, and you cannot take it back.",
    },
    "Confirm primary ownership": {
      to: (o) => `confirm ${o.agentIs} the owner`,
      did: "confirmed ownership",
      how: "Confirm once the channel shows you as its owner. That pays the seller from the buyer's money.",
      what: (o) =>
        `Our agent confirms they own the channel. Channel Adda then pays ${o.seller} into ${o.sellerPoss} Channel Adda wallet.`,
      button: "I am the owner",
      titles: {
        buyer: "Our agent confirms they own it",
        seller: "Our agent confirms, and you are paid",
      },
      caution:
        "Only once you are the channel's owner. This pays the seller from the buyer's money, and cannot be undone.",
    },
    "Verify the channel": {
      to: () => "check the channel",
      did: "checked the channel",
      how: "Check you are the owner, the member count and that the channel is genuine. Post the latest proof in the deal chat, then confirm here.",
      what: () =>
        "Our agent checks they are the owner, the members and that the channel is genuine, and posts proof in the deal chat. From here the channel is out of the seller's hands.",
      button: "The channel checks out",
      caution:
        "Only once the channel checks out and you have posted the latest proof in the deal chat. The buyer pays the seller next.",
    },
    "Make the buyer primary owner": {
      to: (o) => `transfer ownership to ${o.buyer}`,
      did: "transferred ownership to the buyer",
      how: "Use Transfer Ownership to make the buyer's username, named on this page, the owner, then leave the channel. That completes the deal.",
      what: (o) =>
        `Our agent transfers ownership to ${o.buyerPoss} Telegram account and leaves the channel. That completes the deal.`,
      button: "I have transferred ownership",
      caution:
        "Only once the buyer is the channel's owner. This completes the deal, and cannot be undone.",
    },
  };
}

function websiteActs(m: DealMode): Record<string, Act> {
  return {
    "Invite the agent as owner": {
      to: (o) => `give ${o.agent} access`,
      did: "gave our agent access",
      how: "Give our agent access to the site's hosting and admin, using the email shown on this page.",
      what: (o) =>
        `The seller gives ${o.agent} access to the site's hosting and admin.`,
      button: "I have given the agent access",
    },
    "Accept the owner invite": {
      to: () => "check the access",
      did: "checked their access",
      how: "Sign in to the hosting and the site's admin, then confirm here.",
      what: () => "Our agent signs in to the hosting and the site's admin.",
      button: "I have access",
    },
    "Invite the buyer as owner": {
      to: (o) => `give ${o.buyer} access`,
      did: "gave the buyer access",
      how:
        m === "FASTEST"
          ? "Check your access, then give the buyer's email, named on this page, access to the site's admin. That starts the holding period."
          : "Give the buyer's email, named on this page, access to the site's admin.",
      what: (o) =>
        m === "FASTEST"
          ? `Our agent checks their access and gives ${o.buyer} access to the site's admin. That starts the holding period.`
          : `Our agent gives ${o.buyer} access to the site's admin.`,
      button: "I have given the buyer access",
    },
    "Make the agent primary owner": {
      to: (o) => `transfer the domain to ${o.agent}`,
      did: "transferred the domain to our agent",
      how:
        m === "FASTEST"
          ? `Unlock the domain, send our agent the auth code, approve the transfer, and hand over the hosting account. ${PAID_WHEN}`
          : "Unlock the domain, send our agent the auth code, approve the transfer, and hand over the hosting account.",
      what: (o) =>
        m === "FASTEST"
          ? `The seller transfers the domain and hosting to ${o.agent}. That is when the seller is paid.`
          : `The seller transfers the domain and hosting to ${o.agent}.`,
      button: "I have transferred the domain",
      caution:
        m === "FASTEST"
          ? "Only once the domain and hosting are on their way to our agent. Our agent confirms it next, and that is when you are paid. You cannot take the website back."
          : "Only once the domain and hosting are on their way to our agent. Our agent checks it next, and you cannot take it back.",
    },
    "Confirm primary ownership": {
      to: () => "confirm the domain is ours",
      did: "confirmed the domain and hosting are Channel Adda's",
      how: "Confirm once the domain and hosting are in Channel Adda's name. That pays the seller from the buyer's money.",
      what: (o) =>
        `Our agent confirms the domain and hosting are Channel Adda's. Channel Adda then pays ${o.seller} into ${o.sellerPoss} Channel Adda wallet.`,
      button: "The domain is ours",
      titles: { seller: "Our agent confirms, and you are paid" },
      caution:
        "Only once the domain and hosting are in Channel Adda's name. This pays the seller from the buyer's money, and cannot be undone.",
    },
    "Verify the channel": {
      to: () => "check the website",
      did: "checked the website",
      how: "Check the domain and hosting are Channel Adda's, then the traffic and the income. Post the latest proof in the deal chat, then confirm here.",
      what: () =>
        "Our agent checks the domain and hosting are Channel Adda's, the traffic and the income, and posts proof in the deal chat. From here the website is out of the seller's hands.",
      button: "The website checks out",
      caution:
        "Only once the website checks out and you have posted the latest proof in the deal chat. The buyer pays the seller next.",
    },
    "Make the buyer primary owner": {
      to: (o) => `transfer the website to ${o.buyer}`,
      did: "transferred the website to the buyer",
      how: "Transfer the domain and hosting to the buyer's email, named on this page, and hand over the site's admin. That completes the deal.",
      what: (o) =>
        `Our agent transfers the domain and hosting to ${o.buyerPoss} email and hands over the admin. That completes the deal.`,
      button: "I have transferred it",
      caution:
        "Only once the domain and hosting are in the buyer's name. This completes the deal, and cannot be undone.",
    },
  };
}

const PLATFORM_ACTS: Readonly<
  Record<Platform, (m: DealMode) => Record<string, Act>>
> = {
  YOUTUBE: youtubeActs,
  INSTAGRAM: instagramActs,
  FACEBOOK: facebookActs,
  TELEGRAM: telegramActs,
  WEBSITE: websiteActs,
};

function actFor(mode: DealMode, label: string, platform: Platform) {
  const w = wordsFor(platform);
  return PLATFORM_ACTS[platform](mode)[label] ?? moneyActs(w)[label] ?? null;
}

/** Steps from earlier templates, still on deals finished with them. */
const LEGACY_ACTORS: Readonly<Record<string, DealActor>> = {
  "Transfer ownership to the buyer": "agent",
};

/** Who does this step in this mode, by the template. */
function actorOf(mode: DealMode, label: string): DealActor | null {
  return (
    templateFor(mode).find((s) => s.label === label)?.actor ??
    LEGACY_ACTORS[label] ??
    null
  );
}

const SUBJECT: Record<DealActor, string> = {
  buyer: "The buyer",
  seller: "The seller",
  agent: "Our agent",
  staff: "Channel Adda",
  system: "Channel Adda",
};

/** Irregular "-ing" forms among the verbs a step starts with. */
const GERUND: Readonly<Record<string, string>> = {
  transfer: "transferring",
};

function splitVerb(phrase: string): [string, string] {
  const space = phrase.indexOf(" ");
  return space === -1
    ? [phrase, ""]
    : [phrase.slice(0, space), phrase.slice(space)];
}

/** "invite our agent" → "invites our agent". */
export function third(phrase: string): string {
  const [verb, rest] = splitVerb(phrase);
  return `${verb}s${rest}`;
}

/** "invite our agent" → "inviting our agent". */
export function gerund(phrase: string): string {
  const [verb, rest] = splitVerb(phrase);
  const ing =
    GERUND[verb] ??
    (verb.endsWith("e") && !verb.endsWith("ee")
      ? `${verb.slice(0, -1)}ing`
      : `${verb}ing`);
  return `${ing}${rest}`;
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function lowerFirst(text: string): string {
  // "I have…" stays as it is.
  if (/^I\b/.test(text)) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * What each step is called on screen, for whoever is reading, on this
 * platform.
 *
 * The stored labels are identifiers as much as words — running deals are
 * matched on them, and `deals:in-flight` treats a changed one as old steps —
 * so they stay, and this is what is shown instead. Each name says who does
 * it, from the reader's side ("You pay", "The seller invites our agent as
 * owner"), so the list needs no "Then the seller" under every line. Staff
 * read it in the third person, in the platform's words too: the dispute
 * desk listed "Make the agent primary owner" on a Facebook deal (QA,
 * CA-75190). A step from an earlier template keeps its stored label.
 */
export function stepTitle(
  label: string,
  viewer: DealActor,
  platform: Platform,
  mode: DealMode,
): string {
  const act = actFor(mode, label, platform);
  const actor = actorOf(mode, label);
  if (!act || !actor) return label;
  const reader = viewer === "system" ? "staff" : viewer;
  const own = act.titles?.[reader];
  if (own) return own;
  if (actor === reader) return `You ${act.to(them(reader))}`;
  return `${SUBJECT[actor]} ${third(act.to(them(reader)))}`;
}

/**
 * A step, done, in words for whoever reads it: "made the buyer an admin"
 * reads "made you an admin" to the buyer. The stored line names everybody
 * in the third person, and the buyer read "Imran Hossain made the buyer an
 * admin" about themselves (QA, CA-87042).
 */
export function didFor(did: string, reader: DealActor): string {
  if (reader === "buyer") {
    return did
      .replace(/\bthe buyer's\b/g, "your")
      .replace(/\bthe buyer\b/g, "you");
  }
  if (reader === "agent") {
    return did
      .replace(/\bour agent's\b/g, "your")
      .replace(/\bour agent\b/g, "you");
  }
  if (reader === "seller") {
    return did
      .replace(/\bthe seller's\b/g, "your")
      .replace(/\bthe seller\b/g, "you");
  }
  return did;
}

/** Every step a deal of this mode and platform has, and the older ones. */
function actsOf(mode: DealMode, platform: Platform): Act[] {
  return [
    ...Object.values(PLATFORM_ACTS[platform](mode)),
    ...Object.values(moneyActs(wordsFor(platform))),
  ];
}

/**
 * A line the deal chat stored, read by this reader on this deal.
 *
 * Lines are written once, in the third person, and read by both sides and
 * our agent. Two kinds are rewritten for the reader: a step done ("Imran
 * Hossain made the buyer an admin" reads "…made you an admin" to the
 * buyer) and the line that says the seller has been paid ("…so you have
 * been paid", to the seller). A line stored before steps had each
 * platform's words — "Done: Invite the agent as owner (Imran Khan)" on an
 * Instagram deal — is said in this platform's words now (QA, CA-17139).
 * Anything else, a member's reason among it, is left exactly as written.
 */
export function readDealLine(
  body: string,
  ctx: { reader: DealActor; platform: Platform; mode: DealMode },
): string {
  const { reader, platform, mode } = ctx;

  // Before lines led with the name: "Done: <stored label> (<name>)".
  const old = /^Done: (.+) \(([^()]+)\)$/.exec(body);
  if (old) {
    const act = actFor(mode, old[1], platform);
    return act ? `${old[2]} ${didFor(act.did, reader)}` : body;
  }

  // "<name> <did>": the longest step that ends the line, so "confirmed
  // ownership" is never taken for part of a longer one.
  const did = actsOf(mode, platform)
    .map((act) => act.did)
    .filter((text) => body.endsWith(` ${text}`))
    .sort((a, b) => b.length - a.length)[0];
  if (did) return `${body.slice(0, -did.length)}${didFor(did, reader)}`;

  // Fastest: the seller has been paid. Either wording, the earlier one
  // YouTube's even on a Page.
  if (
    /^Our agent (?:has the .+ now|is primary owner), so the seller has been paid\. Our agent (?:hands it to the buyer|makes the buyer primary owner) next$/.test(
      body,
    )
  ) {
    return sellerPaidLine(reader, platform);
  }
  return body;
}

/** Fastest's "the seller has been paid" line, for this reader. */
function sellerPaidLine(reader: DealActor, platform: Platform): string {
  const asset = wordsFor(platform).asset;
  if (reader === "seller") {
    return `Our agent has the ${asset} now, so you have been paid. Our agent hands it to the buyer next`;
  }
  if (reader === "buyer") {
    return `Our agent has the ${asset} now, so the seller has been paid. Our agent hands it to you next`;
  }
  if (reader === "agent") {
    return `You have the ${asset} now, so the seller has been paid. You hand it to the buyer next`;
  }
  return `Our agent has the ${asset} now, so the seller has been paid. Our agent hands it to the buyer next`;
}

function otherMode(mode: DealMode): DealMode {
  return mode === "SAFEST" ? "FASTEST" : "SAFEST";
}

/**
 * The step as an instruction to whoever does it: "Invite our agent as owner".
 * What a notification or an email asks them for.
 */
export function stepAsk(
  label: string,
  platform: Platform,
  mode: DealMode,
): string {
  const act = actFor(mode, label, platform);
  const actor = actorOf(mode, label);
  if (!act || !actor) return label;
  return cap(act.to(them(actor)));
}

/**
 * The step, done, after the name of whoever did it — the deal chat's line
 * ("Nadia Rahman invited our agent as owner"). Nobody's "you": the line is
 * written once and read by both sides.
 */
export function stepDone(
  label: string,
  platform: Platform,
  mode: DealMode,
): string {
  return actFor(mode, label, platform)?.did ?? `completed “${label}”`;
}

/** The badge's short instruction for the doer: "Invite our agent now". */
function askNow(act: Act, actor: DealActor): string {
  return `${cap((act.ask ?? act.to)(them(actor)))} now`;
}

/** "Waiting for the seller to invite our agent". */
function waitingFor(act: Act, actor: DealActor, reader: DealActor): string {
  return `Waiting for ${SUBJECT[actor].toLowerCase()} to ${(act.ask ?? act.to)(them(reader))}`;
}

// ---------------------------------------------------------------------------
// What a status means, for this reader
// ---------------------------------------------------------------------------

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
  platform: Platform = "YOUTUBE",
): string {
  const safest = mode === "SAFEST";
  const w = wordsFor(platform);
  const asset = w.asset;
  const handover = actFor(mode, "Invite the agent as owner", platform);
  const last = actFor(mode, "Make the buyer primary owner", platform);

  switch (status) {
    case "AWAITING_PAYMENT":
      if (viewer === "buyer") {
        return safest
          ? `Nothing starts until our fee is paid. You do not pay the price now: you pay it to the seller directly, once our agent holds the ${asset}.`
          : `Nothing starts until you pay Channel Adda. We then hold your payment until our agent has the ${asset}, and our agent hands it to you.`;
      }
      if (viewer === "seller") {
        return `The buyer has not paid yet. Your ${asset} stays with you, and nothing is asked of you until they do.`;
      }
      return "The buyer has not paid yet, so no step has opened.";

    case "AGENT_VERIFYING":
      if (viewer === "buyer") {
        return `Channel Adda is holding your payment while the seller hands the ${asset} to our agent.`;
      }
      if (viewer === "seller") {
        return `${handover ? cap(handover.to(them("seller"))) : "Hand it to our agent"}. ${w.agentOnPage} The buyer's payment is with Channel Adda in the meantime.`;
      }
      return `The seller is handing the ${asset} to you.`;

    case "AWAITING_CUSTODY":
      if (viewer === "buyer") {
        return `The seller is handing the ${asset} to our agent. You have paid our fee and nothing else — you pay the seller only once our agent holds the ${asset}.`;
      }
      if (viewer === "seller") {
        return `${handover ? cap(handover.to(them("seller"))) : "Hand it to our agent"}. ${w.agentOnPage}`;
      }
      return `The seller is handing the ${asset} to you.`;

    case "IN_CUSTODY":
      if (safest) {
        if (viewer === "buyer") {
          return `Our agent holds the ${asset} now, not the seller. Pay the seller the price directly, to the details they gave on this page, then press Paid.`;
        }
        if (viewer === "seller") {
          return `Our agent holds the ${asset}. The buyer pays you directly next, to the details you gave on this page.`;
        }
        return `You hold this ${asset}. The buyer pays the seller directly next.`;
      }
      if (viewer === "buyer") {
        return `Our agent has the ${asset} and the seller has been paid. ${last ? `Our agent ${third(last.to(them("buyer")))}` : "Our agent hands it to you"} next.`;
      }
      if (viewer === "seller") {
        return `Our agent holds the ${asset} and your money is in your Channel Adda wallet. Nothing more is needed from you.`;
      }
      return `The seller has been paid. ${last ? cap(last.to(them("agent"))) : "Hand it to the buyer"}, using the account on this page.`;

    case "AWAITING_BUYER_PAYMENT":
    case "AWAITING_RELEASE":
      // Only a deal opened under an earlier set of steps can be here, and
      // its steps are not this page's any more.
      return "This deal began under our earlier steps. Channel Adda will finish it with you in the chat.";

    case "AWAITING_HANDOVER":
      if (safest) {
        if (viewer === "buyer") {
          return `The seller confirmed your payment. Our agent is handing the ${asset} to you.`;
        }
        if (viewer === "seller") {
          return `You confirmed the buyer's payment, so your part is done. Our agent is handing the ${asset} to the buyer.`;
        }
        return `Hand the ${asset} to the buyer, using the account on this page.`;
      }
      if (viewer === "buyer") {
        return `${w.buyerAccept ? `${w.buyerAccept} ` : ""}After the holding period the seller hands the ${asset} fully to our agent and is paid, and our agent then hands it to you.`;
      }
      if (viewer === "seller") {
        return `When the holding period ends, hand the ${asset} fully to our agent. That is when you are paid. We tell you the moment you can.`;
      }
      return `The holding period, then the seller hands the ${asset} fully to you.`;

    case "COMPLETED":
      if (viewer === "buyer") return `Finished. The ${asset} is yours.`;
      if (viewer === "seller") {
        return safest
          ? `Finished. The ${asset} is the buyer's, and the buyer paid you directly.`
          : "Finished. Channel Adda paid your money into your Channel Adda wallet.";
      }
      return "Finished. Nothing is outstanding on this deal.";

    case "PAYMENT_EXPIRED":
      return "The payment window closed before the money arrived, so this deal never started and the listing went back on the market.";

    case "CANCELLED":
      return "This deal was stopped before anything changed hands.";

    case "RETURNED_TO_SELLER":
      if (viewer === "seller") {
        return `Our agent has given the ${asset} back to you. Nothing was transferred to the buyer.`;
      }
      return `Our agent returned the ${asset} to the seller, so nothing was transferred.`;

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
type Viewer = "buyer" | "seller" | "agent";

/** Everything a step's headline is made from. */
type Ctx = {
  w: Words;
  mode: DealMode;
  /** The deal's hold is still running. */
  held: boolean;
  /** Safest: the buyer's turn to pay, and the seller has not said where. */
  payToMissing: boolean;
  /** The buyer's name, where a line is better with it. */
  buyerName?: string;
  /** This deal's step, in this platform's words. */
  act: (label: string) => Act;
};

/** "The seller invites you as owner", for this reader. */
function said(c: Ctx, label: string, reader: DealActor): string {
  const act = c.act(label);
  const actor = actorOf(c.mode, label) ?? "agent";
  return actor === reader
    ? cap(act.to(them(reader)))
    : `${SUBJECT[actor]} ${third(act.to(them(reader)))}`;
}

type Override = (c: Ctx, reader: Viewer) => DealHeadline;

/** The badge for an open step: your move, or whose it is. */
function stepLabel(c: Ctx, label: string, reader: Viewer): string {
  const act = c.act(label);
  const actor = actorOf(c.mode, label) ?? "agent";
  if (actor === reader) return askNow(act, actor);
  if (actor === "agent") {
    return `Our agent is ${gerund((act.ask ?? act.to)(them(reader)))}`;
  }
  return waitingFor(act, actor, reader);
}

const WAITING = "In the waiting period";

/**
 * The steps whose status-level copy would be wrong, keyed
 * `MODE:STATUS:open step`. A status spans several steps — on Safest,
 * AWAITING_CUSTODY is two of the seller's and two of our agent's — so the
 * key is the step itself; the status is in it so a paused deal, whose open
 * step has not moved, never reads as running. Everything else falls back.
 */
const BY_OPEN_STEP: Partial<Record<string, Override>> = {
  "SAFEST:AWAITING_CUSTODY:2": (c, r) => {
    const step = "Invite the agent as owner";
    return {
      label: stepLabel(c, step, r),
      short: "Handing over to us",
      sentence: {
        buyer: `The seller is handing the ${c.w.asset} to our agent. You have paid our fee and nothing else — you pay the seller only once our agent holds the ${c.w.asset}.`,
        seller: `${said(c, step, "seller")}. ${c.w.agentOnPage}`,
        agent: `The seller is handing the ${c.w.asset} to you.`,
      }[r],
    };
  },
  "SAFEST:AWAITING_CUSTODY:3": (c, r) => {
    const step = "Accept the owner invite";
    const wait = c.w.googleWait;
    const gave = c.act("Invite the agent as owner").did;
    const later = c.act("Make the agent primary owner").to(them("seller"));
    return {
      label: stepLabel(c, step, r),
      short: "Agent taking over",
      // The seller still has a step to come — making our agent primary
      // owner, transferring ownership, leaving the Page — so they are
      // never told their part is done here (QA, CA-82257).
      sentence: {
        buyer: `The seller ${didFor(gave, "buyer")}. ${said(c, step, "buyer")} next${wait ? ", and then Google's 7-day wait starts" : ""}.`,
        seller: `Next, ${lowerFirst(said(c, step, "seller"))}${wait ? ", and then Google's 7-day wait starts" : ""}. After that it is your turn again: ${later}.`,
        agent: `The seller ${didFor(gave, "agent")}. ${said(c, step, "agent")}, then confirm here${wait ? " — that starts Google's 7-day wait" : ""}.`,
      }[r],
    };
  },
  "SAFEST:AWAITING_CUSTODY:4": (c, r) => {
    const step = "Make the agent primary owner";
    if (c.held && c.w.googleWait) {
      return {
        label: WAITING,
        short: "Waiting period",
        sentence: {
          buyer:
            "Our agent is an owner. After Google's 7-day wait, the seller makes our agent primary owner.",
          seller:
            "When Google's 7-day wait ends, make our agent primary owner of the channel. We tell you the moment you can.",
          agent:
            "Google's 7-day wait is running. Then the seller makes you primary owner.",
        }[r],
      };
    }
    return {
      label: stepLabel(c, step, r),
      short: "Handing over to us",
      sentence: {
        buyer: `${said(c, step, "buyer")} next.`,
        seller: `${said(c, step, "seller")}.`,
        agent: `${said(c, step, "agent")} next.`,
      }[r],
    };
  },
  "SAFEST:AWAITING_CUSTODY:5": (c, r) => {
    const step = "Verify the channel";
    return {
      label: stepLabel(c, step, r),
      short: "Agent checking",
      sentence: {
        buyer: `Our agent has the ${c.w.asset} and is checking it. The latest proof comes to you in the deal chat, then you pay the seller.`,
        seller: `You have handed the ${c.w.asset} to our agent. They check it next, then the buyer pays you.`,
        agent: c.act(step).how,
      }[r],
    };
  },
  "SAFEST:IN_CUSTODY:6": (c, r) =>
    c.payToMissing
      ? {
          // The buyer's step, and nothing for them to pay to: until the
          // seller says where, it is the seller's move (QA, CA-27058).
          label: {
            buyer: "Waiting for the seller's payment details",
            seller: `Say where ${c.buyerName ?? "the buyer"} should pay you`,
            agent: "Waiting for the seller's payment details",
          }[r],
          short: "Seller adding details",
          sentence: {
            buyer: `Our agent holds the ${c.w.asset} now, not the seller. The seller has not said where to pay them yet — we have asked them. Once their details show on this page, pay them and press Paid.`,
            seller: `Our agent holds the ${c.w.asset}. Say where ${c.buyerName ?? "the buyer"} should pay you, in the box on this page — they cannot pay you until you do.`,
            agent: `You hold the ${c.w.asset}. The seller has not said where the buyer should pay them yet.`,
          }[r],
        }
      : {
          label: {
            buyer: "Pay the seller now",
            seller: "Waiting for the buyer to pay you",
            agent: "Waiting for the buyer to pay the seller",
          }[r],
          short: "Buyer paying",
          sentence: {
            buyer: `Our agent holds the ${c.w.asset} now, not the seller. Pay the seller the price directly, to the details they gave on this page, then press Paid.`,
            seller: `Our agent holds the ${c.w.asset}. The buyer pays you directly next, to the details you gave on this page.`,
            agent: `You hold the ${c.w.asset}. The buyer is paying the seller directly.`,
          }[r],
        },
  "SAFEST:IN_CUSTODY:7": (c, r) => ({
    label: {
      buyer: "Waiting for the seller to confirm your payment",
      seller: "Confirm the buyer's payment",
      agent: "Waiting for the seller to confirm the payment",
    }[r],
    short: "Seller confirming",
    sentence: {
      buyer: `You have marked it paid. Once the seller confirms the money arrived, our agent starts handing the ${c.w.asset} to you.`,
      seller:
        "The buyer says they have paid you. When the money is in your account, press Received. If it has not arrived, say so in the deal chat.",
      agent:
        "The buyer says they have paid. Waiting for the seller to confirm it arrived.",
    }[r],
  }),
  "SAFEST:AWAITING_HANDOVER:8": (c, r) => {
    const step = "Invite the buyer as owner";
    const next = c.act("Make the buyer primary owner");
    return {
      label: stepLabel(c, step, r),
      short: "Agent handing over",
      sentence: {
        buyer: c.w.googleWait
          ? "The seller confirmed your payment. Our agent invites your account as owner next. Then Google's 7-day wait starts, and after it you are made primary owner."
          : `The seller confirmed your payment. ${said(c, step, "buyer")} next, then ${third(next.to(them("buyer")))}.`,
        seller: `You confirmed the buyer's payment, so your part is done. Our agent hands the ${c.w.asset} to the buyer now.`,
        agent: c.w.googleWait
          ? "Invite the buyer's account on this page as owner, then confirm here. That starts Google's 7-day wait before you can make them primary owner."
          : `${said(c, step, "agent")}, using the account on this page, then confirm here.`,
      }[r],
    };
  },
  "SAFEST:AWAITING_HANDOVER:9": (c, r) => {
    const step = "Make the buyer primary owner";
    const wait = c.held && c.w.googleWait;
    return {
      label:
        r === "agent" && !c.held
          ? stepLabel(c, step, r)
          : r === "buyer"
            ? c.w.buyerNext
            : wait
              ? WAITING
              : "Handing over to the buyer",
      short: wait ? "Waiting period" : "Handing over",
      sentence: {
        buyer: wait
          ? "Accept our agent's owner invite if you have not yet. Our agent makes you primary owner once Google's 7-day wait is over — we tell you then."
          : `${c.w.buyerAccept ? `${c.w.buyerAccept} ` : ""}${said(c, step, "buyer")} next.`,
        seller: wait
          ? "Your part is done. Our agent makes the buyer primary owner once Google's 7-day wait is over."
          : `Your part is done. ${said(c, step, "seller")} next.`,
        agent: wait
          ? "Once Google's 7-day wait is over, make the buyer primary owner, using the account on this page. That completes the deal."
          : `${said(c, step, "agent")}, using the account on this page. That completes the deal.`,
      }[r],
    };
  },
  "FASTEST:AGENT_VERIFYING:2": (c, r) => {
    const step = "Invite the agent as owner";
    return {
      label: stepLabel(c, step, r),
      short: "Handing over to us",
      sentence: {
        buyer: `Channel Adda is holding your payment. The seller is handing the ${c.w.asset} to our agent.`,
        seller: `${said(c, step, "seller")}. ${c.w.agentOnPage} The buyer's payment is with Channel Adda in the meantime.`,
        agent: `The seller is handing the ${c.w.asset} to you.`,
      }[r],
    };
  },
  "FASTEST:AGENT_VERIFYING:3": (c, r) => {
    const step = "Invite the buyer as owner";
    const gave = c.act("Invite the agent as owner").did;
    const later = c.act("Make the agent primary owner").to(them("seller"));
    return {
      label: stepLabel(c, step, r),
      short: "Agent taking over",
      // Not "your part is done": when the holding period ends the seller
      // still hands it over fully, and that is when they are paid (QA,
      // CA-82257).
      sentence: {
        buyer: `The seller ${didFor(gave, "buyer")}. ${said(c, step, "buyer")} next — that starts the holding period.`,
        seller: `Next, ${lowerFirst(said(c, step, "seller"))}, and the holding period starts. When it ends it is your turn again: ${later} — that is when you are paid.`,
        agent: `The seller ${didFor(gave, "agent")}. ${c.act(step).how}`,
      }[r],
    };
  },
  "FASTEST:AWAITING_HANDOVER:4": (c, r) => {
    const step = "Make the agent primary owner";
    const last = c.act("Make the buyer primary owner");
    const thenBuyer = `our agent then ${third(last.to(them(r)))}`;
    if (c.held) {
      return {
        label: "In the holding period",
        short: "Holding period",
        sentence: {
          buyer: `${c.w.buyerAccept ? `${c.w.buyerAccept} ` : ""}When the holding period ends, the seller ${third(c.act(step).to(them("buyer")))} and is paid, and ${thenBuyer}.`,
          seller: `When the holding period ends, ${c.act(step).to(them("seller"))}. That is when you are paid. We tell you the moment you can.`,
          agent: `The holding period is running. Then the seller ${third(c.act(step).to(them("agent")))}.`,
        }[r],
      };
    }
    return {
      label: stepLabel(c, step, r),
      short: "Handing over to us",
      sentence: {
        buyer: `The holding period is over. The seller ${third(c.act(step).to(them("buyer")))} next and is paid, and ${thenBuyer}.`,
        seller: `The holding period is over. ${said(c, step, "seller")} — that is when you are paid.`,
        agent: `The holding period is over. ${said(c, step, "agent")} next.`,
      }[r],
    };
  },
  "FASTEST:AWAITING_HANDOVER:5": (c, r) => {
    const step = "Confirm primary ownership";
    const last = c.act("Make the buyer primary owner");
    return {
      label:
        r === "agent"
          ? stepLabel(c, step, r)
          : r === "seller"
            ? "Our agent is checking, then you are paid"
            : "Our agent is checking it",
      short: "Agent confirming",
      sentence: {
        buyer: `The seller says they have handed it over. Our agent checks, the seller is paid, and then our agent ${third(last.to(them("buyer")))}.`,
        seller: `You have handed the ${c.w.asset} over. Once our agent confirms it, your money reaches your Channel Adda wallet.`,
        agent: `The seller says they have handed it over. ${c.act(step).how}`,
      }[r],
    };
  },
  "FASTEST:IN_CUSTODY:6": (c, r) => {
    const step = "Make the buyer primary owner";
    return {
      label:
        r === "agent"
          ? stepLabel(c, step, r)
          : `Our agent is handing the ${c.w.asset} to ${them(r).buyer}`,
      short: "Transferring",
      sentence: {
        buyer: `Our agent has the ${c.w.asset} and the seller has been paid. ${said(c, step, "buyer")} next.`,
        seller: `Our agent has the ${c.w.asset} and your money is in your Channel Adda wallet. Your part is done.`,
        agent: `The seller has been paid. ${said(c, step, "agent")}, using the account on this page. That completes the deal.`,
      }[r],
    };
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

/** A status label about "the channel", in this platform's word. */
function inWords(text: string, w: Words): string {
  return text.replace(/\bchannel\b/g, w.asset);
}

/**
 * What the deal says at the top for this reader, given which step is open.
 *
 * A status can cover several steps owned by different people, and copy
 * written for the status alone went stale the moment the first of them was
 * done: the seller who had just invited the agent was still told to invite
 * the agent, and the agent's desk still said "with the seller". It follows
 * the deal's hold too: a step whose wait is over no longer says "when the
 * holding period ends".
 */
export function dealHeadline(
  status: OrderStatus,
  mode: DealMode,
  viewer: DealActor,
  openStep: number | null,
  platform: Platform,
  /** The open step waits for Channel Adda to assign an agent. */
  awaitingAgent = false,
  /** The deal's hold — Google's wait, or the holding period — is running. */
  held = false,
  /**
   * Safest: the buyer's turn to pay the seller, and the seller has not said
   * where (`dealTurn`). Then it is the seller's move.
   */
  payToMissing = false,
  /** The buyer's name, for the seller's "Say where … should pay you". */
  buyerName?: string,
): DealHeadline {
  const w = wordsFor(platform);
  if (awaitingAgent) {
    return {
      label: "Channel Adda is assigning an agent",
      short: "Assigning an agent",
      sentence:
        viewer === "seller"
          ? `Channel Adda is assigning an agent to run this deal. We tell you who to hand the ${w.asset} to as soon as they join.`
          : viewer === "buyer"
            ? "Your payment is with Channel Adda. We are assigning an agent to run the deal, and the seller hands it to them next."
            : "This deal is waiting for an agent.",
    };
  }
  const override =
    openStep === null
      ? undefined
      : BY_OPEN_STEP[`${mode}:${status}:${openStep}`];
  if (override) {
    const reader: Viewer =
      viewer === "buyer" || viewer === "seller" ? viewer : "agent";
    const acts = PLATFORM_ACTS[platform](mode);
    const money = moneyActs(w);
    return override(
      {
        w,
        mode,
        held,
        payToMissing,
        buyerName,
        act: (label) => acts[label] ?? money[label],
      },
      reader,
    );
  }
  return {
    label: inWords(
      (isReader(viewer) ? PERSONAL_LABELS[status]?.[viewer] : undefined) ??
        STATUS_LABELS[status],
      w,
    ),
    short: inWords(STATUS_SHORT[status], w),
    sentence: statusSentence(status, mode, viewer, platform),
  };
}

/**
 * The congratulations at the end of a deal that went through, for this
 * reader, in the platform's word: an Instagram buyer was told "The channel
 * is yours" (QA, CA-27058).
 */
export function completeWords(
  viewer: DealActor,
  mode: DealMode,
  platform: Platform,
): { title: string; body: string } {
  const asset = wordsFor(platform).asset;
  if (viewer === "buyer") {
    return {
      title: `Congratulations! The ${asset} is yours.`,
      body: `Keep your certificate. It shows this ${asset} came to you through Channel Adda.`,
    };
  }
  if (viewer === "seller") {
    return {
      title: "Congratulations! Your sale is complete.",
      body:
        mode === "FASTEST"
          ? "Your money is in your wallet. Keep the certificate as a record of the sale."
          : `The buyer has paid you and the ${asset} is theirs. Keep the certificate as a record of the sale.`,
    };
  }
  return {
    title: "This deal is complete.",
    body:
      mode === "FASTEST"
        ? `The ${asset} has changed hands and the seller has been paid.`
        : `The ${asset} has changed hands, and the buyer paid the seller directly.`,
  };
}

/**
 * The money card's last line: what Channel Adda is holding right now.
 *
 * Fastest holds the money until our agent has the account, then the
 * account. Safest never holds the price: it holds the account, but only
 * once our agent has it — "Channel Adda holds: The account" sat on a deal
 * whose seller had handed nothing over (QA, CA-27058) — so before that it
 * says what happens next. Nothing on a deal that has ended or is unpaid.
 */
export function heldLine(input: {
  mode: DealMode;
  platform: Platform;
  /** Ended, or not paid yet: nothing is held. */
  idle: boolean;
  /** Our agent holds it (`custodyAt`). */
  inCustody: boolean;
  /** Safest: our agent is checking it (the verify step is open). */
  checking?: boolean;
}): {
  label: string;
  value: { kind: "total" } | { kind: "text"; text: string };
  note: string;
} | null {
  if (input.idle) return null;
  const asset = wordsFor(input.platform).asset;
  if (input.inCustody) {
    return {
      label: "Channel Adda holds",
      value: { kind: "text", text: `The ${asset}` },
      note: "our agent holds it until it is handed to the buyer",
    };
  }
  if (input.mode === "FASTEST") {
    return {
      label: "Channel Adda is holding",
      value: { kind: "total" },
      note: "the price and our fee together",
    };
  }
  return {
    label: "Next",
    value: {
      kind: "text",
      text: input.checking
        ? `Our agent checks the ${asset}`
        : `Our agent takes the ${asset}`,
    },
    note: `The seller hands the ${asset} to our agent first. Only once our agent holds it does the buyer pay the seller.`,
  };
}

/**
 * The staff desk's words for where a deal's account is and what finishing
 * it does, in the platform's terms: the dispute desk said "The seller is
 * still primary owner" and "our agent makes the buyer primary owner" on a
 * Facebook Page (QA, CA-75190).
 */
export function staffWords(platform: Platform, mode: DealMode = "FASTEST") {
  const w = wordsFor(platform);
  const asset = w.asset;
  const last = actFor(mode, "Make the buyer primary owner", platform);
  const youtube = platform === "YOUTUBE";
  return {
    asset,
    /** "our agent gives the buyer full control". */
    handToBuyer: last
      ? `our agent ${third(last.to(them("staff")))}`
      : `our agent hands the ${asset} to the buyer`,
    /** Fastest: when the seller was paid. */
    agentTook: youtube
      ? "when our agent became primary owner"
      : `when our agent took the ${asset}`,
    sellerStillHas: youtube
      ? "The seller is still primary owner; our agent takes the channel from them first."
      : `The seller still has the ${asset}; our agent takes it from them first.`,
    sellerOwns: `The seller still owns the ${asset}.`,
    agentHolds: `The agent owns the ${asset}.`,
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

/** What the running wait is called, in a sentence. */
export function waitName(mode: DealMode, platform: Platform): string {
  if (mode === "FASTEST") return "the holding period";
  return platform === "YOUTUBE" ? "Google's 7-day wait" : "the wait";
}

/** The deal's running hold, on the step it is holding back. */
export function holdNote(mode: DealMode, platform: Platform): string {
  if (mode === "SAFEST") {
    if (platform !== "YOUTUBE") {
      return "There is nothing to do until the wait ends — we tell you the moment it does.";
    }
    return "Google makes a new owner wait 7 days before they can be made primary owner. There is nothing to do but wait — we tell you the moment it ends.";
  }
  return platform === "YOUTUBE"
    ? "The holding period is also Google's 7-day wait before our agent can be made primary owner. There is nothing to do until then — we tell you the moment it ends."
    : `The seller is paid only after the holding period, once the ${wordsFor(platform).asset} has stayed safely with our agent. There is nothing to do until then — we tell you the moment it ends.`;
}

/**
 * Staff ending a hold early, in words true of the platform: only Google
 * can let a YouTube transfer through sooner.
 */
export function endWaitCheck(platform: Platform, mode: DealMode): string {
  if (platform === "YOUTUBE") {
    return "Only if Google already lets the transfer go ahead. The next step opens straight away and we tell whoever does it.";
  }
  return mode === "FASTEST"
    ? `Only if you are sure the ${wordsFor(platform).asset} is safe with our agent and the holding period can end early. The next step opens straight away and we tell whoever does it.`
    : "The next step opens straight away and we tell whoever does it.";
}

/**
 * What each step actually involves, in words a first-time seller can act on,
 * written to whoever is reading: an instruction to the person whose step it
 * is ("Invite our agent's Google account…"), a description to everybody
 * else, with them in it as "you" where it is about them.
 *
 * Keyed by the step labels in `@/lib/deal-templates`. An unknown label gets
 * no explanation rather than a wrong one, so adding a step to a template can
 * never make this file lie. While the deal's hold runs, the step after it
 * says it waits for the hold, so nobody reads it as theirs to do now.
 */
export function stepHelp(
  mode: DealMode,
  label: string,
  platform: Platform,
  viewer: DealActor = "staff",
  held = false,
): string | undefined {
  const act = actFor(mode, label, platform);
  if (!act) return undefined;
  const actor = actorOf(mode, label);
  const text = actor === viewer ? act.how : act.what(them(viewer));
  return held
    ? `When ${waitName(mode, platform)} ends, ${lowerFirst(text)}`
    : text;
}

/**
 * The presses that decide where the money and the channel go, which ask
 * once more before they count. Received above all: pressed by mistake, the
 * seller's channel goes to a buyer who has not paid, and cannot come back.
 * The seller handing full control to our agent cannot be taken back either.
 * Our agent's last press ends the deal, and on Fastest their custody pays
 * the seller.
 */
export function confirmFirst(
  mode: DealMode,
  label: string,
  platform: Platform = "YOUTUBE",
): string | undefined {
  const act = actFor(mode, label, platform);
  // Verifying is Safest's alone; Fastest has no such step.
  if (!act || !actorOf(mode, label)) return undefined;
  return act.caution;
}

/** The second press, in words that say what is being sworn to. */
const CONFIRM_YES: Readonly<Record<string, string>> = {
  "Verify the channel": "Yes, it checks out",
  "Pay the seller": "Yes, I have sent it",
  "Confirm the payment arrived": "Yes, it arrived",
};

export function confirmYes(
  label: string,
  platform: Platform = "YOUTUBE",
  mode: DealMode = "FASTEST",
): string {
  return (
    CONFIRM_YES[label] ??
    `Yes, ${lowerFirst(confirmLabel(label, platform, mode))}`
  );
}

/** What the step's button says. */
export function confirmLabel(
  label: string,
  platform: Platform = "YOUTUBE",
  mode: DealMode = "FASTEST",
): string {
  return (
    actFor(mode, label, platform)?.button ??
    actFor(otherMode(mode), label, platform)?.button ??
    "Mark this done"
  );
}

/**
 * What a step does with the buyer's account, for the email that names it to
 * whoever will use it, or null for a step that does not touch it.
 */
export function handoverUse(platform: Platform, handsOver: boolean): string {
  const uses: Record<Platform, [string, string]> = {
    YOUTUBE: [
      "Invite this account as an owner",
      "Make this account the primary owner",
    ],
    INSTAGRAM: [
      "The account moves to this email at the end",
      "Move the account to this email",
    ],
    FACEBOOK: [
      "Add this account to the Page",
      "Give this account full control",
    ],
    TELEGRAM: [
      "Make this account an admin",
      "Transfer ownership to this account",
    ],
    WEBSITE: [
      "Give this email access to the site's admin",
      "Transfer the website to this email",
    ],
  };
  return uses[platform][handsOver ? 1 : 0];
}

/**
 * What the buyer is told when our agent first gives them access — or, on
 * Instagram, has only secured the login, since a Fastest buyer gets
 * nothing to sign in to until the end.
 */
export function buyerAccessNote(
  platform: Platform,
  mode: DealMode,
  holdStarted: boolean,
): { title: string; body: string } {
  const last = actFor(mode, "Make the buyer primary owner", platform);
  const end = last
    ? `our agent ${third(last.to(them("buyer")))}`
    : "our agent hands it to you";
  const after = !holdStarted
    ? `${cap(end)} next.`
    : mode === "SAFEST"
      ? `Google's 7-day wait has started, and when it ends ${end}.`
      : `The holding period has started, and when it ends the seller is paid and ${end}.`;
  switch (platform) {
    case "YOUTUBE":
      return {
        title: "Accept our agent's owner invite",
        body: `Our agent has invited the account you gave on the deal as an owner. Accept it. ${after}`,
      };
    case "FACEBOOK":
      return {
        title: "Accept our agent's Page invite",
        body: `Our agent has added the account you gave on the deal to the Page. Accept the invite. ${after}`,
      };
    case "TELEGRAM":
      return {
        title: "Our agent made you an admin",
        body: `Our agent has added your Telegram account to the channel as an admin. ${after}`,
      };
    case "INSTAGRAM":
      return mode === "FASTEST"
        ? {
            title: "Our agent has secured the login",
            body: `Only Channel Adda can sign in to the account now. ${after}`,
          }
        : {
            title: "Our agent sent you the login",
            body: `The username and password are in the deal chat, so you can sign in and check the account. ${after}`,
          };
    case "WEBSITE":
      return {
        title: "Our agent gave you access",
        body: `Your email now has access to the site's admin. ${after}`,
      };
  }
}
