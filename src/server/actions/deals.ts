"use server";

import { revalidatePath } from "next/cache";
import type { DealMode } from "@/generated/prisma/enums";
import { agentIdentity } from "@/server/admin-users";
import * as repo from "@/server/deals";
import { type PayToFailure, saveSellerPayTo } from "@/server/pay-to";
import { requireRole, requireUser } from "@/server/session";

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
  "not-live": "This listing is not accepting deals right now.",
  "own-listing": "You cannot buy your own listing.",
  taken: "Someone else got there first — this listing is no longer available.",
  "wrong-actor": "This step is not yours to complete.",
  "wrong-step": "An earlier step is still open.",
  terminal: "This deal is already closed.",
  "cap-reached":
    "This agent is holding as many channels as they can. Assign another.",
  "needs-approval": "A second staff member has to approve this handover.",
  "not-paid": "The opening payment has not cleared yet.",
  disputed: "This deal is with Channel Adda while the dispute is open.",
  "needs-dispute":
    "One side says this already happened, so reversing it is a decision, not a correction. Pause it for review first — then it can be decided with both accounts of it on the record.",
  "needs-reference":
    "Add the transaction reference or bank receipt number. It is the only record that you paid the seller, and the first thing a moderator asks for if they say you did not.",
  "on-hold":
    "This deal is in its recovery hold: the window in which an old owner could still reclaim the account. The seller is paid when it ends — the deal page shows the date.",
  "in-custody":
    "One of our agents is holding this channel. Give it back to the seller rather than cancelling — cancelling would close the deal and leave the channel in a staff account.",
  "needs-finance":
    "Paying somebody out of money Channel Adda is holding is the finance desk’s call, not a moderator’s. Everything else about this deal is yours.",
  "not-disputed":
    "A deal is finished by its last step, not from here. Dispute it first if it is stuck.",
  "already-paid":
    "The buyer has already paid the seller, so this cannot be undone here.",
  "bad-proof": "Attach an uploaded file or an https link.",
  "books-mismatch":
    "What Channel Adda is holding for this deal does not match what the deal says was paid, so nothing has been moved. It is listed on the money desk for a developer to look at.",
};

function fail(reason: repo.DealFailure): DealResult {
  return { ok: false, error: MESSAGES[reason] };
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
): Promise<DealResult & { orderId?: string }> {
  const user = await requireUser();

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

  const result = await repo.createDeal({
    listingId,
    buyerId: user.id,
    mode,
    acceptedRevenueRisk: true,
  });

  if (!result.ok) return fail(result.reason);

  refresh(result.orderId);
  revalidatePath("/browse");
  return {
    ok: true,
    message: `Deal ${result.reference} opened.`,
    orderId: result.orderId,
  };
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
  extra?: { proofUrl?: string; paymentRef?: string; approvedById?: string },
): Promise<DealResult> {
  const user = await requireUser();
  const result = await repo.advanceStep({
    orderId,
    position,
    userId: user.id,
    ...extra,
  });

  if (!result.ok) return fail(result.reason);

  refresh(orderId);
  return { ok: true, message: "Done." };
}

/** An agent taking the next job off the queue. */
export async function claimDeal(
  orderId: string,
  agentEmail: string,
  agentBrand: string,
): Promise<DealResult> {
  const user = await requireRole("AGENT");
  // The agent's stored identity wins over whatever was typed. It used to be
  // typed per deal, so one agent reached different sellers under different
  // names — and a seller told to invite the wrong address as owner hands
  // their channel to nobody.
  const stored = await agentIdentity(user.id);
  const result = await repo.assignAgent({
    orderId,
    agentId: user.id,
    agentEmail: stored?.email ?? agentEmail,
    agentBrand: stored?.brand ?? agentBrand,
    byUserId: user.id,
  });

  if (!result.ok) return fail(result.reason);

  refresh(orderId);
  return { ok: true, message: "You are on this deal." };
}

/** Staff placing an agent on a deal, or moving one to somebody else. */
export async function assignDealAgent(
  orderId: string,
  agentId: string,
  agentEmail: string,
  agentBrand: string,
): Promise<DealResult> {
  const user = await requireRole("MODERATOR", "FINANCE");
  const stored = await agentIdentity(agentId);
  const result = await repo.assignAgent({
    orderId,
    agentId,
    agentEmail: stored?.email ?? agentEmail,
    agentBrand: stored?.brand ?? agentBrand,
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
    if (outcome === "reference-mismatch") {
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

  const result = await repo.resolveDeal({
    orderId,
    to,
    byUserId: user.id,
    note: reason,
  });

  if (!result.ok) return fail(result.reason);

  refresh(orderId);
  revalidatePath("/browse");

  const messages = {
    CANCELLED: "Deal cancelled.",
    RETURNED_TO_SELLER: "Channel returned to the seller.",
    REFUNDED: "Buyer refunded.",
    DISPUTED: "Raised with Channel Adda. A moderator will take it from here.",
    COMPLETED: "Deal completed.",
  } as const;
  return { ok: true, message: messages[to] };
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
