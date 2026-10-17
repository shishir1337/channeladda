"use server";

import { revalidatePath } from "next/cache";
import * as repo from "@/server/adjustments";
import { cryptomusConfig } from "@/server/cryptomus";
import { reconcileInvoice } from "@/server/invoices";
import { requireRole } from "@/server/session";

/**
 * The money desk's one write: correcting a member's balance.
 *
 * `requireRole("FINANCE")` runs first and throws before any work, and
 * `adjustBalance` re-reads the caller's role from the database itself — the
 * same two layers `decidePayout` and `settleWithdrawal` have. Hiding the
 * form from other roles is not the control.
 *
 * The amount crosses this boundary as the text somebody typed and is turned
 * into integer cents here by string arithmetic, so no float is ever part of
 * the calculation, let alone the write.
 */
export type MoneyResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const MESSAGES: Record<repo.AdjustmentFailure, string> = {
  "wrong-actor": "Only finance or a superadmin can correct a balance.",
  self: "You cannot correct your own balance. Ask a colleague.",
  "not-found": "That member no longer exists.",
  "staff-account":
    "That is a staff account. Only a superadmin can correct a staff member's balance.",
  "bad-amount": "Enter an amount in dollars and cents, like 20 or 20.50.",
  "too-large": `No single correction can be more than ${dollars(repo.MAX_ADJUSTMENT_USD)}. Split it, or check for an extra zero.`,
  "reason-too-short": `Say why in at least ${repo.MIN_REASON_LENGTH} characters. The member reads this on their wallet.`,
  "reason-too-long": `Keep the reason under ${repo.MAX_REASON_LENGTH} characters.`,
  "needs-superadmin": `Finance can add up to ${dollars(repo.FINANCE_CREDIT_CAP_USD)} to one member in ${repo.CREDIT_WINDOW_HOURS} hours, counting every correction in that time. Ask a superadmin to make this one.`,
  insufficient:
    "That would take their balance below what is already promised to a payout they asked for. Take less, or settle the payout first.",
  conflict:
    "Their balance changed at the same moment. Nothing was recorded — check the figures and try again.",
  duplicate: "That correction was already recorded. Nothing was added twice.",
  "bad-key": "The form went stale. Reload the page and try again.",
};

function dollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/**
 * "20", "20.5", "$1,020.50" → integer cents, or null.
 *
 * Parsed as text — whole part times one hundred plus the cents digits — so
 * there is no multiplication of a float anywhere on the way in.
 */
function centsFromText(text: string): number | null {
  const cleaned = text.trim().replace(/^\$/, "").replace(/[,\s]/g, "");
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const cents =
    Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export async function adjustMemberBalance(input: {
  userId: string;
  direction: "credit" | "debit";
  amount: string;
  reason: string;
  key: string;
}): Promise<MoneyResult> {
  const staff = await requireRole("FINANCE");

  // A server action is a public endpoint; the shape is not trusted either.
  if (
    typeof input?.userId !== "string" ||
    typeof input.amount !== "string" ||
    typeof input.reason !== "string" ||
    typeof input.key !== "string" ||
    (input.direction !== "credit" && input.direction !== "debit")
  ) {
    return { ok: false, error: MESSAGES["bad-key"] };
  }

  const cents = centsFromText(input.amount);
  if (cents === null) return { ok: false, error: MESSAGES["bad-amount"] };

  const signed = input.direction === "credit" ? cents : -cents;
  const result = await repo.adjustBalance({
    userId: input.userId,
    amountUsd: signed,
    reason: input.reason,
    byUserId: staff.id,
    key: input.key,
  });
  if (!result.ok) return { ok: false, error: MESSAGES[result.reason] };

  revalidatePath("/admin/money");
  revalidatePath("/admin/money/adjust");
  revalidatePath(`/admin/users/${input.userId}`);
  revalidatePath("/dashboard/wallet");

  const amount = (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  return {
    ok: true,
    message:
      input.direction === "credit"
        ? `Added ${amount}. The member has been told, and the platform's side of the books was debited to match.`
        : `Took ${amount}. The member has been told, and the platform's side of the books was credited to match.`,
  };
}

/**
 * Asking the processor about one invoice, now.
 *
 * For a buyer who says they paid while the deal says they did not. The
 * sweep would get to it in time; this is for when somebody is waiting. It
 * applies the payment only if the processor confirms it, exactly as the
 * sweep would, so pressing it twice is harmless.
 */
export async function checkInvoiceNow(reference: string): Promise<MoneyResult> {
  await requireRole("FINANCE");
  if (!cryptomusConfig()) {
    return {
      ok: false,
      error:
        "Cryptomus is not connected on this server, so there is nobody to ask. Add its keys, or record the payment by hand if you have proof.",
    };
  }

  const outcome = await reconcileInvoice(reference.trim());
  revalidatePath("/admin/deals");
  switch (outcome) {
    case "applied":
      return {
        ok: true,
        message:
          "Cryptomus confirmed it as paid, and it is booked: to the deal if the deal was waiting for it, or to the buyer's balance if the deal had already been paid another way.",
      };
    case "already-applied":
      return {
        ok: true,
        message: "This invoice was already dealt with. Nothing changed.",
      };
    case "not-found":
      return { ok: false, error: "We have no invoice with that reference." };
    case "not-yet":
      return {
        ok: false,
        error:
          "Cryptomus has not confirmed this as paid, or did not answer. Nothing changed. Try again in a few minutes.",
      };
  }
}
