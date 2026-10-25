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
import {
  closeGoneDeal,
  paymentInProgress,
  saleState,
} from "@/server/listing-hold";
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
  // The opening payment is the only one Channel Adda takes: the whole amount
  // on Fastest, the admin fee on Safest, whose price goes to the seller.
  const stage =
    deal.status === "AWAITING_PAYMENT"
      ? ({ purpose: "DEAL", amountUsd: deal.totalUsd } as const)
      : null;
  if (!stage) {
    return { ok: false, error: "This deal has nothing left to pay." };
  }

  // Only a payment reserves a listing, so it may have gone to somebody else
  // since this deal opened, or someone may be paying for it by crypto now.
  // Said before an invoice is raised: crypto sent for a listing that has
  // gone would only come back as balance.
  const order = await db.order.findUniqueOrThrow({
    where: { id: deal.id },
    select: { listingId: true, offerId: true },
  });
  // A listing reserved by nobody goes back on sale for this buyer; one that
  // has gone closes the deal, which would otherwise wait for a payment it
  // can never take (the owner, 2026-10-26).
  const sale = await saleState(order);
  if (sale === "gone") {
    await closeGoneDeal(deal.id);
    revalidatePath(`/dashboard/deals/${deal.id}`);
    return {
      ok: false,
      error:
        "This account is no longer for sale, so we closed this deal. You were not charged.",
    };
  }
  if (sale === "held") {
    return {
      ok: false,
      error:
        "The seller has accepted another buyer's offer for this account. If they do not pay in time, it comes back on sale and you can pay.",
    };
  }
  if (await paymentInProgress(order.listingId, deal.id)) {
    return {
      ok: false,
      error:
        "Another buyer is paying for this listing right now. If they have not paid within the hour, you can buy it.",
    };
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
  // Back to the conversation, whichever page the buyer paid from: it shows
  // the payment arriving and the next step, with the deal page a click away.
  // It cannot depend on where they started — pressing Pay again reuses the
  // invoice still open, and Cryptomus keeps the first request's return
  // address. (The deal page's old ?paid=1 was read by nothing.)
  const back = deal.conversationId
    ? `${base}/dashboard/messages/${deal.conversationId}`
    : `${base}/dashboard/deals/${deal.id}`;
  const raise = (reference: string) =>
    createInvoice({
      amountUsd: stage.amountUsd,
      orderId: reference,
      callbackUrl: `${base}/api/webhooks/cryptomus`,
      successUrl: back,
      returnUrl: back,
    });

  try {
    // A reference is good for one invoice's life, not the deal's. Cryptomus
    // answers an order_id it has seen with that same invoice — open within
    // its hour, and the same cancelled one after it — and a deal waits 48
    // hours for payment. Keyed on the deal's reference, every press after
    // the first hour sent the buyer to a dead page.
    const latest = await db.invoice.findFirst({
      where: { orderId: deal.id, purpose: stage.purpose, appliedAt: null },
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
      purpose: stage.purpose,
      amountUsd: stage.amountUsd,
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
