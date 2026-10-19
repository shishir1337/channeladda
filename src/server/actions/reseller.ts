"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { createInvoice, isConfigured } from "@/server/cryptomus";
import { newReference, recordInvoice } from "@/server/invoices";
import { buyResellerPass } from "@/server/reseller";
import { requireUser } from "@/server/session";
import { getSettings } from "@/server/settings";

/**
 * Buying the Reseller badge, from the wallet page.
 *
 * Each press of the page's button carries one nonce, made when the page
 * drew it, so a double click or a retried request buys one pass rather than
 * two — the purchase is idempotent on it.
 */
export type ResellerResult =
  | { ok: true; message: string; url?: string }
  | { ok: false; error: string };

const NONCE = /^[A-Za-z0-9_-]{16,64}$/;

function siteUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3000";
  return base.replace(/\/$/, "");
}

const until = (date: Date) =>
  date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export async function buyResellerFromBalance(
  nonce: string,
): Promise<ResellerResult> {
  const user = await requireUser();
  if (!NONCE.test(nonce)) {
    return { ok: false, error: "Reload the page and try again." };
  }

  const result = await buyResellerPass({
    userId: user.id,
    reference: `BAL-${user.id}-${nonce}`,
    via: "BALANCE",
  });
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "busy"
          ? "We could not finish that just now. Nothing was charged — try again."
          : "Your available balance does not cover it. Top up, or pay with crypto instead.",
    };
  }
  revalidatePath("/dashboard/wallet");
  return {
    ok: true,
    message: `Your Reseller badge is active until ${until(result.endsAt)}.`,
  };
}

export async function startResellerCheckout(): Promise<ResellerResult> {
  const user = await requireUser();
  if (!isConfigured()) {
    return {
      ok: false,
      error:
        "Crypto checkout is not switched on yet. Top up your balance, or pay from it if it already covers the badge.",
    };
  }

  const { resellerPriceUsd } = await getSettings();
  const base = siteUrl();
  try {
    const open = await db.invoice.findFirst({
      where: {
        userId: user.id,
        purpose: "BADGE",
        amountUsd: resellerPriceUsd,
        appliedAt: null,
        settledAt: null,
        createdAt: { gt: new Date(Date.now() - 50 * 60_000) },
      },
      orderBy: { createdAt: "desc" },
      select: { reference: true },
    });
    const reference = open?.reference ?? newReference("BADGE");
    if (!open) {
      await recordInvoice({
        reference,
        purpose: "BADGE",
        amountUsd: resellerPriceUsd,
        userId: user.id,
      });
    }
    const invoice = await createInvoice({
      amountUsd: resellerPriceUsd,
      orderId: reference,
      callbackUrl: `${base}/api/webhooks/cryptomus`,
      successUrl: `${base}/dashboard/wallet?badge=1#reseller`,
      returnUrl: `${base}/dashboard/wallet#reseller`,
    });
    return { ok: true, message: "Opening the payment page…", url: invoice.url };
  } catch (error) {
    console.error("[reseller] badge invoice", error);
    return {
      ok: false,
      error: "Could not open a payment page. Nothing has been charged.",
    };
  }
}
