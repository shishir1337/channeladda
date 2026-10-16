"use server";

import { createInvoice, isConfigured } from "@/server/cryptomus";
import { getDealFor } from "@/server/deals";
import { recordInvoice } from "@/server/invoices";
import { requireUser } from "@/server/session";

/**
 * Getting a buyer to a payment page.
 *
 * Separate from the deal actions because it is the one place that talks to a
 * third party, and because it has a fallback the rest of the flow does not:
 * when Cryptomus is not configured, the deal still exists and the finance desk
 * can record the payment by hand. That is how the product worked before this
 * and it must keep working, so a missing key degrades rather than breaks.
 */
export type PayResult =
  | { ok: true; url: string }
  | { ok: false; error: string; manual?: boolean };

function siteUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3000";
  return base.replace(/\/$/, "");
}

export async function startPayment(orderId: string): Promise<PayResult> {
  const user = await requireUser();

  // Read through getDealFor so the caller must be party to the deal: a
  // stranger must not be able to raise invoices against other people's orders.
  const deal = await getDealFor(user.id, orderId);
  if (!deal) return { ok: false, error: "That deal is no longer available." };

  if (deal.viewerRole !== "buyer") {
    return { ok: false, error: "Only the buyer pays this." };
  }
  if (deal.status !== "AWAITING_PAYMENT") {
    return { ok: false, error: "This deal has already been paid." };
  }

  if (!isConfigured()) {
    return {
      ok: false,
      manual: true,
      error:
        "Card and crypto checkout is not switched on yet. Channel Adda will " +
        "send you payment details and confirm it against this deal by hand.",
    };
  }

  const base = siteUrl();
  try {
    // Written before the invoice is raised, so a callback always has
    // something to resolve against even if this request then fails.
    await recordInvoice({
      reference: deal.reference,
      purpose: "DEAL",
      amountUsd: deal.totalUsd,
      userId: user.id,
      orderId: deal.id,
    }).catch(() => {
      // Already recorded: the buyer pressed pay twice. Harmless.
    });

    const invoice = await createInvoice({
      amountUsd: deal.totalUsd,
      // The deal reference is what the webhook looks the order up by, and
      // Cryptomus requires it to be unique per invoice.
      orderId: deal.reference,
      callbackUrl: `${base}/api/webhooks/cryptomus`,
      successUrl: `${base}/dashboard/deals/${deal.id}?paid=1`,
      returnUrl: `${base}/dashboard/deals/${deal.id}`,
    });
    return { ok: true, url: invoice.url };
  } catch (error) {
    console.error(`[payments] invoice for ${orderId}`, error);
    return {
      ok: false,
      error:
        "Could not open a payment page just now. Nothing has been charged — " +
        "try again in a moment.",
    };
  }
}
