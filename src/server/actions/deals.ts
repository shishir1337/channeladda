"use server";

import { revalidatePath } from "next/cache";
import type { DealMode } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { MAX_DEAL_NOTE } from "@/lib/deal-endings";
import { needsEmailVerification } from "@/lib/email-verification";
import { parseHandoverTo } from "@/lib/handover-target";
import { identityFor, missingIdentity } from "@/lib/transfer-identity";
import { agentIdentity } from "@/server/admin-users";
import * as repo from "@/server/deals";
import { type PayToFailure, saveSellerPayTo } from "@/server/pay-to";
import { requireRole, requireUser } from "@/server/session";
import { payFromWallet, type WalletFailure } from "@/server/wallet";

/**
 * Deals, from every side.
 *
 * The session decides who is acting. Which part that person plays in a deal —
 * buyer, seller, assigned agent, staff — is worked out from the order itself
 * inside `@/server/deals`, never taken from the request. A client that could
 * name its own role could complete the other side's steps.
 */

export type DealResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const MESSAGES: Record<repo.DealFailure, string> = {
  "not-found": "That deal is no longer available.",
  "too-many-unpaid":
    "You have three deals waiting for payment. Pay for one, or cancel one, before starting another.",
  "not-live": "This listing is not accepting deals right now.",
  "own-listing": "You cannot buy your own listing.",
  taken: "Someone else got there first — this listing is no longer available.",
  "wrong-actor": "This step is not yours to complete.",
  "wrong-step": "An earlier step is still open.",
  "already-done": "This step is already done.",
  "no-pay-to":
    "The seller has not said where to pay them yet. We have asked them — press Paid once their details show on this deal.",
  terminal: "This deal is already closed.",
  "cap-reached":
    "This agent is holding as many channels as one agent may. Give it to somebody else.",
  "needs-approval": "A second staff member has to approve this handover.",
  "not-paid": "The opening payment has not cleared yet.",
  disputed: "This deal is with Channel Adda while the dispute is open.",
  "needs-dispute":
    "One side says this already happened, so reversing it is a decision, not a correction. Pause it for review first — then it can be decided with both accounts of it on the record.",
  "on-hold":
    "The waiting period is still running, so this step is not open yet. The chat shows when it ends, and we tell you the moment it does.",
  "not-on-hold": "The waiting period on this deal has already ended.",
  "not-handed-over":
    "The seller has not handed the channel over yet, so paying them now would leave them with the money and the channel both. Refund the buyer instead.",
  "seller-paid":
    "The seller was paid when our agent became primary owner, so there is nothing left to refund. Finish the deal: our agent hands the channel to the buyer.",
  "no-agent":
    "Channel Adda is still assigning an agent to this deal. You will be told the account to invite as soon as they join.",
  "old-steps":
    "This deal was opened under our earlier steps, so its steps cannot be done from here. Channel Adda will finish it with you — say so in the chat.",
  "already-paid":
    "The seller has said the buyer's payment arrived, so the channel cannot go back to them — they would keep the money and the channel both. Decide it for the buyer instead.",
  "in-custody":
    "One of our agents is holding this channel. Give it back to the seller rather than cancelling — cancelling would close the deal and leave the channel in a staff account.",
  "needs-finance":
    "Paying somebody out of money Channel Adda is holding is the finance desk’s call, not a moderator’s. Everything else about this deal is yours.",
  "not-disputed":
    "A deal is finished by its last step, not from here. Dispute it first if it is stuck.",
  "bad-proof": "Attach an uploaded file or an https link.",
  "handed-over":
    "Ownership has already been handed to the account you gave, so it can no longer be changed. Message the agent in the chat if something is wrong.",
  "bad-handover": "That account does not look right for this platform.",
  "seller-started":
    "The seller has already invited our agent, so this can't just be cancelled — the access has to be handed back first. Use Report a problem and our team will sort it out.",
  "out-of-level":
    "This deal's price is outside that person's level. Level 1 runs deals under $100, level 2 from $100 to under $1,000, level 3 from $1,000.",
  "price-not-paid":
    "The buyer has not marked the price paid, so this deal cannot be finished for them — the channel would go for the fee alone. Return the channel to the seller instead.",
  "books-mismatch":
    "What Channel Adda is holding for this deal does not match what the deal says was paid, so nothing has been moved. It is listed on the money desk for a developer to look at.",
};

/**
 * Some refusals read differently to an agent taking a deal for themselves
 * than to staff handing it to somebody: "Assign another" means nothing to
 * the person who is the agent.
 */
const SELF_MESSAGES: Partial<Record<repo.DealFailure, string>> = {
  "cap-reached":
    "You are holding as many channels as one agent may. Finish or hand one on before you take another.",
  "out-of-level": "This deal's price is outside your level.",
};

function fail(reason: repo.DealFailure, reader?: "self"): DealResult {
  return {
    ok: false,
    error:
      (reader === "self" ? SELF_MESSAGES[reason] : undefined) ??
      MESSAGES[reason],
  };
}

/**
 * The public pages a deal's ending changes: a sold listing leaves the
 * seller's page, the sellers list and the browse pages, and lands on the
 * sold page. They are cached for a minute, and the seller's page still
 * showed a sold listing as live right after the sale (QA, 2026-10-26).
 */
async function refreshPublicFor(orderId: string, onlyIfCompleted = false) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      listing: { select: { slug: true } },
      seller: { select: { slug: true } },
    },
  });
  if (!order || (onlyIfCompleted && order.status !== "COMPLETED")) return;
  revalidatePath(`/listing/${order.listing.slug}`);
  if (order.seller.slug) revalidatePath(`/seller/${order.seller.slug}`);
  revalidatePath("/sellers");
  revalidatePath("/sold");
  revalidatePath("/browse");
  revalidatePath("/browse/[platform]", "page");
  revalidatePath("/");
}

function refresh(orderId?: string) {
  revalidatePath("/dashboard/deals");
  revalidatePath("/admin/deals");
  // A deal writes into its conversation, and is run from it too.
  revalidatePath("/dashboard/messages", "layout");
  if (orderId) revalidatePath(`/dashboard/deals/${orderId}`);
}

export async function startDeal(
  listingId: string,
  mode: DealMode,
  acceptedRevenueRisk = false,
  handoverTo = "",
): Promise<DealResult & { orderId?: string; conversationId?: string }> {
  const user = await requireUser();

  // As for offers: every update about the deal goes to this address.
  if (needsEmailVerification(user)) {
    return {
      ok: false,
      error: "Confirm your email address before starting a deal.",
    };
  }

  // Three published policies say the buyer acknowledges this at checkout.
  // Checked here as well as in the browser, because a policy is only worth
  // the record behind it.
  if (!acceptedRevenueRisk) {
    return {
      ok: false,
      error:
        "Tick the box to confirm you understand revenue and monetization are not guaranteed.",
    };
  }

  // Asked before paying, so whoever transfers the account never has to ask
  // the buyer for it — and checked against the platform, because a mistyped
  // Google address hands a channel to a stranger.
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { platform: true },
  });
  if (!listing) return fail("not-found");
  const target = parseHandoverTo(listing.platform, handoverTo);
  if (!target.ok) return { ok: false, error: target.error };

  const result = await repo.createDeal({
    listingId,
    buyerId: user.id,
    mode,
    acceptedRevenueRisk: true,
    handoverTo: target.value,
  });

  if (!result.ok) return fail(result.reason);

  refresh(result.orderId);
  revalidatePath("/browse");
  return {
    ok: true,
    message: `Deal ${result.reference} opened.`,
    orderId: result.orderId,
    conversationId: result.conversationId,
  };
}

/** The buyer correcting the account that receives ownership. */
export async function changeHandoverTo(
  orderId: string,
  value: string,
): Promise<DealResult> {
  const user = await requireUser();
  const result = await repo.updateHandoverTo({
    orderId,
    byUserId: user.id,
    raw: value,
  });
  if (!result.ok) return fail(result.reason);
  refresh(orderId);
  return { ok: true, message: "Saved. Whoever transfers it has been told." };
}

/**
 * Complete whichever step is next, as whoever is signed in.
 *
 * `approvedById` is only read on the step that hands value across, and only
 * above the platform's threshold. It is an attestation by the agent that a
 * named staff member signed off, not an independent action by that person —
 * a two-phase approval needs a pending-approval row and is not built yet.
 */
export async function completeStep(
  orderId: string,
  position: number,
  extra?: { proofUrl?: string; approvedById?: string },
): Promise<DealResult> {
  const user = await requireUser();
  // The buyer's Paid waits for the seller's payment details.
  if (await repo.payToMissing(orderId, position)) return fail("no-pay-to");
  const result = await repo.advanceStep({
    orderId,
    position,
    userId: user.id,
    ...extra,
  });

  if (!result.ok) return fail(result.reason);

  refresh(orderId);
  // The last step sells the listing.
  await refreshPublicFor(orderId, true);
  return { ok: true, message: "Done." };
}

/** The platform a deal's listing is on, or null for no such deal. */
async function platformOf(orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { listing: { select: { platform: true } } },
  });
  return order?.listing.platform ?? null;
}

/**
 * Somebody who runs deals taking the next job off the queue: an agent, a
 * moderator, or the superadmin (who passes every `requireRole`). The deal's
 * level is checked in `assignAgent`.
 */
export async function claimDeal(
  orderId: string,
  /** Ignored: the stored transfer identity is used. Kept for old clients. */
  _agentEmail?: string,
  _agentBrand?: string,
): Promise<DealResult> {
  const user = await requireRole("AGENT", "MODERATOR");
  // The agent's stored identity, and nothing else. It used to be typed per
  // deal, so one agent reached different sellers under different names —
  // and the desk prefilled a staff member's sign-in email when they had no
  // identity, so a seller was told to invite demo-admin@… as owner (QA,
  // 2026-10-26). A login email is never shown to a member. And it is the
  // one for this deal's platform: a Telegram seller makes a username an
  // admin, never an email (QA, CA-87042).
  const platform = await platformOf(orderId);
  if (!platform) return fail("not-found");
  const stored = await agentIdentity(user.id);
  const address = identityFor(platform, stored);
  if (!stored || !address) {
    return {
      ok: false,
      error: stored
        ? missingIdentity(platform, { self: true })
        : "Set your transfer identity first — the account sellers hand deals to. It is under Your deal desk, on your Security page.",
    };
  }
  const result = await repo.assignAgent({
    orderId,
    agentId: user.id,
    agentEmail: address,
    agentBrand: stored.brand,
    byUserId: user.id,
  });

  if (!result.ok) return fail(result.reason, "self");

  refresh(orderId);
  return { ok: true, message: "You are on this deal." };
}

/** Staff placing an agent on a deal, or moving one to somebody else. */
export async function assignDealAgent(
  orderId: string,
  agentId: string,
  /** Ignored: the stored transfer identity is used. Kept for old clients. */
  _agentEmail?: string,
  _agentBrand?: string,
): Promise<DealResult> {
  const user = await requireRole("MODERATOR", "FINANCE");
  // As for claiming: only a stored transfer identity, the one for this
  // deal's platform — never a login email and never what was typed.
  const platform = await platformOf(orderId);
  if (!platform) return fail("not-found");
  const stored = await agentIdentity(agentId);
  const address = identityFor(platform, stored);
  if (!stored || !address) {
    const person = await db.user.findUnique({
      where: { id: agentId },
      select: { name: true },
    });
    return {
      ok: false,
      error: stored
        ? missingIdentity(platform, {
            self: false,
            name: person?.name || "This person",
          })
        : "This person has no transfer identity yet — the account sellers hand deals to. Set it on their Team page first.",
    };
  }
  const result = await repo.assignAgent({
    orderId,
    agentId,
    agentEmail: address,
    agentBrand: stored.brand,
    byUserId: user.id,
  });

  if (!result.ok) return fail(result.reason);

  refresh(orderId);
  return { ok: true, message: "Agent assigned." };
}

/**
 * Stands in for the Cryptomus webhook until that exists.
 *
 * FINANCE only: this is the action that decides money arrived, and every
 * other step of the deal unlocks behind it.
 */
export async function markOpeningPaymentReceived(
  orderId: string,
  ref: string,
  asset: string,
): Promise<DealResult> {
  await requireRole("FINANCE");

  const reference = ref.trim();
  if (!reference) {
    return { ok: false, error: "Enter the payment reference." };
  }

  const outcomes: Record<repo.PaymentOutcome, string> = {
    applied: "Payment recorded. The deal is under way.",
    "already-applied":
      "That payment was already recorded. Nothing has changed.",
    "second-payment-credited":
      "This deal was already paid, so that payment went to the buyer's balance.",
    "reference-mismatch":
      "This deal is already paid under another reference, and there is no settled invoice matching this one. Nothing was credited — the mismatch is in the audit trail for you to reconcile.",
    "credited-to-balance":
      "This deal had already stopped, so that payment went to the buyer's balance rather than opening it.",
    "invoice-open":
      "This deal has a Cryptomus checkout that is still open or already paid, so the money you saw may be that payment. Use “Check now” on the money desk instead — recording it here as well would count it twice. Nothing was recorded.",
  };

  try {
    const outcome = await repo.recordManualPayment(
      orderId,
      reference,
      asset.trim() || "USDT",
    );
    refresh(orderId);

    // A mismatch is not a failure of the request — the money may well be
    // real — but it is not what the clerk thinks they just did, so it comes
    // back as an error rather than a tick.
    if (outcome === "reference-mismatch" || outcome === "invoice-open") {
      return { ok: false, error: outcomes[outcome] };
    }
    return { ok: true, message: outcomes[outcome] };
  } catch (error) {
    // Only an order that does not exist, or a row that kept moving under
    // the write, reaches here now. Everything else has an outcome.
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not record that payment.",
    };
  }
}

/**
 * End a deal some way other than completing it.
 *
 * Who may reach which ending is decided by the transition table, not here, so
 * a buyer can raise a dispute but cannot refund themselves.
 */
export async function endDeal(
  orderId: string,
  to:
    | "CANCELLED"
    | "RETURNED_TO_SELLER"
    | "REFUNDED"
    | "DISPUTED"
    | "COMPLETED",
  note: string,
): Promise<DealResult> {
  const user = await requireUser();

  const reason = note.trim();
  if (!reason) {
    return { ok: false, error: "Say why — this goes in the audit trail." };
  }
  if (reason.length > MAX_DEAL_NOTE) {
    return {
      ok: false,
      error: `Keep it under ${MAX_DEAL_NOTE.toLocaleString("en-US")} characters.`,
    };
  }

  const result = await repo.resolveDeal({
    orderId,
    to,
    byUserId: user.id,
    note: reason,
  });

  if (!result.ok) return fail(result.reason);

  refresh(orderId);
  await refreshPublicFor(orderId);

  const messages = {
    CANCELLED: "Deal cancelled.",
    RETURNED_TO_SELLER: "Channel returned to the seller.",
    REFUNDED: "Buyer refunded.",
    DISPUTED: "Raised with Channel Adda. A moderator will take it from here.",
    COMPLETED: "Deal completed.",
  } as const;
  return { ok: true, message: messages[to] };
}

/**
 * Staff ending a deal's waiting period early, when Google lets the transfer
 * through before the date. Moderators and the owner; who may is checked
 * again in `endHoldNow`.
 */
export async function endWaitNow(orderId: string): Promise<DealResult> {
  const user = await requireRole("MODERATOR");
  const result = await repo.endHoldNow({ orderId, byUserId: user.id });
  if (!result.ok) return fail(result.reason);
  refresh(orderId);
  return { ok: true, message: "The wait is over. The next step is open now." };
}

/** What a payment from the balance can be refused for, in plain words. */
const BALANCE_MESSAGES: Partial<Record<WalletFailure, string>> = {
  "not-found": "That deal is no longer available.",
  "wrong-actor": "Only the buyer pays this.",
  insufficient: "Your available balance does not cover this payment.",
  held: "The seller has accepted another buyer's offer for this account. If they do not pay in time, it comes back on sale and you can pay.",
  "being-paid":
    "Another buyer is paying for this listing right now. If they have not paid within the hour, you can buy it.",
};

/**
 * The buyer paying a deal from their Channel Adda balance.
 *
 * Here rather than beside the wallet's own actions so a deal that closed
 * under the buyer's page says why: from a page loaded before another buyer
 * paid, the answer was "This deal is not waiting on a payment" and the pay
 * buttons stayed (QA, CA-75504, CA-27051).
 */
export async function payFromBalance(
  orderId: string,
): Promise<DealResult & { closed?: boolean }> {
  const user = await requireUser();
  const result = await payFromWallet(orderId, user.id);
  refresh(orderId);
  revalidatePath("/dashboard/wallet");
  // A paid deal takes the listing off sale.
  if (result.ok) await refreshPublicFor(orderId);
  if (result.ok) {
    return {
      ok: true,
      message: "Paid from your balance. The deal is under way.",
    };
  }
  if (result.reason === "not-payable" || result.reason === "taken") {
    const why = await repo.closedForPayment(orderId, user.id);
    return {
      ok: false,
      closed: true,
      error:
        why ??
        "This account is no longer for sale, so we closed this deal. You were not charged.",
    };
  }
  return {
    ok: false,
    error:
      BALANCE_MESSAGES[result.reason] ??
      "That payment did not go through. Nothing has been charged.",
  };
}

const PAY_TO_MESSAGES: Record<PayToFailure, string> = {
  "not-found": "That deal is no longer available.",
  "wrong-actor": "Only the seller says where they are paid.",
  "not-safest":
    "On a Fastest deal Channel Adda pays you into your wallet, so there is nothing to add here.",
  terminal: "This deal is already closed.",
  locked:
    "The buyer has already recorded paying you, so these details can no longer change.",
  empty: "Say where the buyer should send the money.",
  "too-long": "Keep it under 500 characters.",
  "has-link":
    "Payment details cannot include a web address. Write the account or wallet details out instead.",
};

/** A Safest seller saying where the buyer should pay them. */
export async function savePayTo(
  orderId: string,
  text: string,
): Promise<DealResult> {
  const user = await requireUser();
  const result = await saveSellerPayTo({ orderId, userId: user.id, text });
  if (!result.ok) return { ok: false, error: PAY_TO_MESSAGES[result.reason] };

  refresh(orderId);
  return {
    ok: true,
    message: "Saved. The buyer sees this when it is their turn to pay you.",
  };
}
