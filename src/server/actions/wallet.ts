"use server";

import { revalidatePath } from "next/cache";
import { safeNext } from "@/lib/safe-next";
import { createInvoice, isConfigured } from "@/server/cryptomus";
import { newReference, recordInvoice } from "@/server/invoices";
import { requireRole, requireUser } from "@/server/session";
import * as repo from "@/server/wallet";

/**
 * The wallet, from both sides of the desk.
 *
 * Amounts cross this boundary in dollars, because that is what a person types
 * into a form, and are converted to integer cents here. Nothing below this
 * line ever sees a float.
 */
export type WalletResult =
  | { ok: true; message: string; url?: string }
  | { ok: false; error: string };

const MESSAGES: Record<repo.WalletFailure, string> = {
  "not-found": "That is no longer available.",
  "wrong-actor": "That is not yours to do.",
  insufficient: "Your available balance does not cover that.",
  "no-address": "Add a payout address first.",
  "below-minimum": "That is below the smallest withdrawal we can send.",
  "address-locked":
    "Your payout address changed in the last 24 hours. Withdrawals are held for a day after a change — it is what stops somebody who gets into your account from emptying it.",
  "already-settled": "That withdrawal has already been dealt with.",
  "not-payable": "This deal is not waiting on a payment.",
};

function toCents(dollars: number): number | null {
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  const cents = Math.round(dollars * 100);
  return cents > 0 ? cents : null;
}

function siteUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3000";
  return base.replace(/\/$/, "");
}

/**
 * Raise an invoice that tops up the signed-in person's balance.
 *
 * `returnTo` is where the processor sends them back to once paid — the deal
 * whose payment the top-up is for, so they can pay it from the balance
 * straight away. Only a path on this site is taken; anything else goes back
 * to the wallet, so the parameter cannot be used to bounce somebody off-site.
 */
export async function startTopUp(
  dollars: number,
  returnTo?: string,
): Promise<WalletResult> {
  const user = await requireUser();

  const cents = toCents(dollars);
  if (cents === null) return { ok: false, error: "Enter an amount." };
  if (cents < 1_000) {
    return { ok: false, error: "The smallest top-up is $10." };
  }
  if (cents > 10_000_00) {
    return { ok: false, error: "For more than $10,000, talk to us first." };
  }

  if (!isConfigured()) {
    return {
      ok: false,
      error:
        "Crypto top-ups are not switched on yet. Channel Adda will send you " +
        "details and credit your balance by hand.",
    };
  }

  // The reference no longer has to carry the payee — the invoice row does
  // that. It used to embed eight characters of the user id, which the webhook
  // recovered by scanning the user table for an id ending in them: lossy,
  // unindexed, and with no ordering, so a collision would land somebody's
  // deposit in a stranger's withdrawable balance.
  const reference = newReference("TOPUP");
  const base = siteUrl();

  const back =
    returnTo && safeNext(returnTo, "") === returnTo
      ? `${base}${returnTo}`
      : null;

  try {
    await recordInvoice({
      reference,
      purpose: "TOPUP",
      amountUsd: cents,
      userId: user.id,
    });

    const invoice = await createInvoice({
      amountUsd: cents,
      orderId: reference,
      callbackUrl: `${base}/api/webhooks/cryptomus`,
      successUrl: back ?? `${base}/dashboard/wallet?topped=1`,
      returnUrl: back ?? `${base}/dashboard/wallet`,
    });
    return { ok: true, message: "Opening the payment page…", url: invoice.url };
  } catch (error) {
    console.error("[wallet] top-up invoice", error);
    return {
      ok: false,
      error: "Could not open a payment page. Nothing has been charged.",
    };
  }
}

/** Pay a deal out of the balance instead of raising a new invoice. */
export async function payDealFromWallet(
  orderId: string,
): Promise<WalletResult> {
  const user = await requireUser();
  const result = await repo.payFromWallet(orderId, user.id);
  if (!result.ok) return { ok: false, error: MESSAGES[result.reason] };

  revalidatePath(`/dashboard/deals/${orderId}`);
  revalidatePath("/dashboard/wallet");
  return {
    ok: true,
    message: "Paid from your balance. The deal is under way.",
  };
}

/** Where a seller wants their money sent. */
export async function savePayoutAddress(
  address: string,
  network: string,
): Promise<WalletResult> {
  const user = await requireUser();

  const trimmed = address.trim();
  const chain = network.trim().toUpperCase();
  if (trimmed.length < 20 || trimmed.length > 120) {
    return { ok: false, error: "That does not look like a wallet address." };
  }
  if (!/^[A-Z0-9]{3,20}$/.test(chain)) {
    return { ok: false, error: "Pick a network." };
  }

  const { locked } = await repo.setPayoutAddress(user.id, trimmed, chain);

  revalidatePath("/dashboard/wallet");
  return {
    ok: true,
    message: locked
      ? "Saved. Withdrawals are held for 24 hours after an address change — " +
        "that delay is what stops somebody who gets into your account from " +
        "emptying it. Check the address carefully in the meantime: a payout " +
        "sent to the wrong one cannot be recovered by us or by anybody else."
      : "That is already your payout address, so nothing changed.",
  };
}

export async function requestPayout(dollars: number): Promise<WalletResult> {
  const user = await requireUser();

  const cents = toCents(dollars);
  if (cents === null) return { ok: false, error: "Enter an amount." };

  const result = await repo.requestWithdrawal(user.id, cents);
  if (!result.ok) return { ok: false, error: MESSAGES[result.reason] };

  revalidatePath("/dashboard/wallet");
  revalidatePath("/admin/payouts");
  return {
    ok: true,
    message: "Requested. Finance reviews payouts within one working day.",
  };
}

/** Finance sending or refusing a payout. */
export async function decidePayout(
  withdrawalId: string,
  to: "SENT" | "REJECTED",
  txHash: string,
  note: string,
): Promise<WalletResult> {
  const staff = await requireRole("FINANCE");

  if (to === "SENT" && txHash.trim() === "") {
    return {
      ok: false,
      error: "Paste the transaction hash — it is the only proof it was sent.",
    };
  }
  if (to === "REJECTED" && note.trim() === "") {
    return { ok: false, error: "Say why, so the seller can be told." };
  }

  const result = await repo.settleWithdrawal(
    withdrawalId,
    staff.id,
    to,
    to === "SENT" ? txHash.trim() : null,
    note.trim() || undefined,
  );
  if (!result.ok) return { ok: false, error: MESSAGES[result.reason] };

  revalidatePath("/admin/payouts");
  return {
    ok: true,
    message: to === "SENT" ? "Marked as sent." : "Rejected and returned.",
  };
}
