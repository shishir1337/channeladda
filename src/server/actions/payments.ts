"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  classifyStatus,
  createInvoice,
  isConfigured,
} from "@/server/cryptomus";
import { getDealFor } from "@/server/deals";
import {
  newReference,
  reconcileInvoice,
  recordInvoice,
} from "@/server/invoices";
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
  | {
      ok: false;
      error: string;
      manual?: boolean;
      /** Not a failure: a message about a payment already made. */
      notice?: boolean;
    };

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
  const raise = (reference: string) =>
    createInvoice({
      amountUsd: deal.totalUsd,
      orderId: reference,
      callbackUrl: `${base}/api/webhooks/cryptomus`,
      successUrl: `${base}/dashboard/deals/${deal.id}?paid=1`,
      returnUrl: `${base}/dashboard/deals/${deal.id}`,
    });

  try {
    // A reference is good for one invoice's life, not the deal's. Cryptomus
    // answers an order_id it has seen with that same invoice — open within
    // its hour, and the same cancelled one after it — and a deal waits 48
    // hours for payment. Keyed on the deal's reference, every press after
    // the first hour sent the buyer to a dead page.
    const latest = await db.invoice.findFirst({
      where: { orderId: deal.id, purpose: "DEAL", appliedAt: null },
      orderBy: { createdAt: "desc" },
      select: { reference: true },
    });

    if (latest) {
      const invoice = await raise(latest.reference);
      switch (classifyStatus(invoice.status, invoice.isFinal)) {
        case "pending":
          return { ok: true, url: invoice.url };
        case "settled":
          // Paid, and the callback has not landed yet. A second invoice
          // would ask the buyer to pay twice.
          return bookArrivedPayment(latest.reference, deal.id);
        case "held":
          return {
            ok: false,
            notice: true,
            error:
              "Cryptomus is holding your payment for a compliance check. " +
              "Do not pay again — Channel Adda will be in touch about it.",
          };
        case "dead":
        case "refunded":
          break; // Nothing was kept from that invoice: raise a fresh one.
      }
    }

    // Random rather than the deal's five-digit reference. Cryptomus keeps
    // order_ids for ever per merchant, and staging shares the merchant, so a
    // reused CA-12345 would hand a production buyer a staging invoice.
    const reference = newReference("DEAL");

    // Written before the invoice is raised, so a callback always has
    // something to resolve against even if this request then fails.
    await recordInvoice({
      reference,
      purpose: "DEAL",
      amountUsd: deal.totalUsd,
      userId: user.id,
      orderId: deal.id,
    });

    const invoice = await raise(reference);
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

async function bookArrivedPayment(
  reference: string,
  dealId: string,
): Promise<PayResult> {
  const outcome = await reconcileInvoice(reference);
  revalidatePath(`/dashboard/deals/${dealId}`);
  return {
    ok: false,
    notice: true,
    error:
      outcome === "applied" || outcome === "already-applied"
        ? "Cryptomus already has your payment for this deal, and it is now " +
          "booked. Refresh to see the next step."
        : "Cryptomus already has your payment for this deal. It is being " +
          "confirmed — do not pay again. This page moves on once it is booked.",
  };
}
