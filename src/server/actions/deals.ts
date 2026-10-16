"use server";

import { revalidatePath } from "next/cache";
import type { DealMode } from "@/generated/prisma/enums";
import * as repo from "@/server/deals";
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
};

function fail(reason: repo.DealFailure): DealResult {
  return { ok: false, error: MESSAGES[reason] };
}

function refresh(orderId?: string) {
  revalidatePath("/dashboard/deals");
  revalidatePath("/admin/deals");
  if (orderId) revalidatePath(`/dashboard/deals/${orderId}`);
}

export async function startDeal(
  listingId: string,
  mode: DealMode,
): Promise<DealResult & { orderId?: string }> {
  const user = await requireUser();
  const result = await repo.createDeal({
    listingId,
    buyerId: user.id,
    mode,
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
  const result = await repo.assignAgent({
    orderId,
    agentId: user.id,
    agentEmail,
    agentBrand,
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
  const result = await repo.assignAgent({
    orderId,
    agentId,
    agentEmail,
    agentBrand,
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

  try {
    await repo.recordOpeningPayment(orderId, reference, asset.trim() || "USDT");
  } catch (error) {
    // recordOpeningPayment throws rather than returning a reason when the
    // order is already paid under a different reference — that means two
    // payments for one deal, which is not a user-correctable mistake.
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not record that payment.",
    };
  }

  refresh(orderId);
  return { ok: true, message: "Payment recorded. The deal is under way." };
}

/**
 * End a deal some way other than completing it.
 *
 * Who may reach which ending is decided by the transition table, not here, so
 * a buyer can raise a dispute but cannot refund themselves.
 */
export async function endDeal(
  orderId: string,
  to: "CANCELLED" | "RETURNED_TO_SELLER" | "REFUNDED" | "DISPUTED",
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
  } as const;
  return { ok: true, message: messages[to] };
}
