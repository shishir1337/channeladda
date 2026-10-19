import { after } from "next/server";
import { verifyWebhookSign } from "@/lib/cryptomus-sign";
import { db } from "@/lib/db";
import { recordAudit } from "@/server/audit";
import {
  classifyStatus,
  cryptomusConfig,
  getInvoice,
} from "@/server/cryptomus";
import { recordOpeningPayment, recordStrayPricePayment } from "@/server/deals";
import {
  applyProcessorRefund,
  markApplied,
  noteCallback,
} from "@/server/invoices";
import { creditDeposit } from "@/server/wallet";

/**
 * Cryptomus payment callbacks.
 *
 * This is the one unauthenticated route in the product that can move a deal
 * forward, so it is deliberately suspicious of its input:
 *
 * 1. The signature is checked against our payment key before anything else is
 *    read. An unsigned body is discarded without touching the database.
 * 2. A settled status is **confirmed against Cryptomus's own API** rather than
 *    believed. A webhook is a claim; the invoice lookup is the fact. This
 *    costs one request per payment and removes the whole class of "forged
 *    callback starts a deal nobody paid for".
 * 3. Replays are harmless because `recordOpeningPayment` claims the order's
 *    null `paymentRef` in a compare-and-set.
 *
 * It always answers 200 once the signature is good. Cryptomus retries on
 * anything else, and a retry loop against a payload we have already handled —
 * or can never handle — is noise, not safety.
 */
export async function POST(request: Request) {
  const config = cryptomusConfig();
  if (!config) {
    // Nothing is configured, so nothing legitimate can be arriving here.
    return Response.json({ error: "not configured" }, { status: 503 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "malformed" }, { status: 400 });
  }

  if (!verifyWebhookSign(payload, config.paymentKey)) {
    // Deliberately terse: a probe learns nothing about why it failed.
    console.warn("[cryptomus] rejected a callback with a bad signature");
    return Response.json({ error: "bad signature" }, { status: 401 });
  }

  const orderId =
    typeof payload.order_id === "string" ? payload.order_id : null;
  const status = typeof payload.status === "string" ? payload.status : "";
  const isFinal = payload.is_final === true;

  if (!orderId) return Response.json({ ok: true });

  const outcome = classifyStatus(status, isFinal);

  // Anything that is not money yet is noted and acknowledged — there is
  // nothing to retry and no reason to make the processor keep asking.
  if (outcome !== "settled") {
    after(async () => {
      try {
        await noteCallback(
          orderId,
          status,
          typeof payload.uuid === "string" ? payload.uuid : null,
        );
        await handle(orderId, status, outcome, payload);
      } catch (error) {
        console.error(`[cryptomus] noting ${orderId}`, error);
      }
    });
    return Response.json({ ok: true });
  }

  // A settled callback is money, and it is applied *before* answering.
  //
  // Doing this after the response was wrong in a way that cost the buyer:
  // returning 200 discards the processor's retry, so a database blip or a
  // failed confirmation lost the payment silently — and the expiry sweep then
  // moved the deal to PAYMENT_EXPIRED, which is terminal, with the money
  // already sent. Answering non-2xx instead asks for the retry, and every
  // write underneath is idempotent (a compare-and-set on the order's null
  // paymentRef, a unique index on the deposit reference), which is what makes
  // a retry safe rather than a second charge.
  try {
    await noteCallback(
      orderId,
      status,
      typeof payload.uuid === "string" ? payload.uuid : null,
    );
    const result = await handle(orderId, status, outcome, payload);

    // Only an invoice that was actually applied is marked applied.
    // Marking it regardless disarmed the reconciliation sweep, which
    // filters on a null appliedAt: a confirmation lookup that timed out
    // returned 200, Cryptomus discarded the retry, the sweep never looked
    // again, and the deal expired with the money sent. That is the exact
    // failure the comment above says was fixed — re-created one line down.
    if (result === "applied") {
      await markApplied(orderId);
      return Response.json({ ok: true });
    }

    // Transient: Cryptomus said paid, we could not confirm it. Ask for the
    // retry and leave the invoice for the sweep.
    if (result === "unconfirmed") {
      return Response.json({ error: "retry" }, { status: 500 });
    }

    // A decision, not a failure: an underpayment, or a reference we do not
    // know. Retrying changes nothing, and the invoice stays open so the
    // sweep can see a later top-up.
    return Response.json({ ok: true });
  } catch (error) {
    console.error(`[cryptomus] handling ${orderId}`, error);
    // 500 so Cryptomus delivers it again. The reconciliation sweep is the
    // backstop for when it stops trying.
    return Response.json({ error: "retry" }, { status: 500 });
  }
}

/**
 * A wallet top-up rather than a deal.
 *
 * Top-up references carry the person's id, because unlike a deal there is no
 * row to look the payer up from — the reference is the only link between the
 * invoice and whose balance it belongs to.
 */
async function handleTopUp(
  reference: string,
  outcome: ReturnType<typeof classifyStatus>,
): Promise<"applied" | "ignored" | "unconfirmed"> {
  if (outcome !== "settled") return "ignored";

  // From the invoice we wrote when it was raised. This used to slice eight
  // characters off the reference and scan the user table for an id ending in
  // them — lossy, unindexed, and with no ordering, so a collision would land
  // somebody's deposit in a stranger's withdrawable balance.
  const invoice = await db.invoice.findUnique({
    where: { reference },
    select: { userId: true },
  });
  if (!invoice) {
    console.warn(`[cryptomus] top-up ${reference} has no invoice`);
    throw new Error(`No invoice for ${reference}`);
  }
  const user = { id: invoice.userId };

  const confirmed = await getInvoice(reference);
  if (
    !confirmed ||
    classifyStatus(confirmed.status, confirmed.isFinal) !== "settled" ||
    confirmed.paidAmountUsd === null ||
    confirmed.paidAmountUsd <= 0
  ) {
    console.warn(`[cryptomus] top-up ${reference} did not confirm`);
    return "unconfirmed";
  }

  // Credited at what actually arrived, not at what was asked for: an
  // overpayment is still the payer's money.
  await creditDeposit(
    user.id,
    confirmed.paidAmountUsd,
    reference,
    confirmed.payerCurrency ?? "USDT",
  );
  return "applied";
}

async function handle(
  orderId: string,
  status: string,
  outcome: ReturnType<typeof classifyStatus>,
  payload: Record<string, unknown>,
): Promise<"applied" | "ignored" | "unconfirmed"> {
  if (orderId.startsWith("TOPUP-")) {
    return handleTopUp(orderId, outcome);
  }

  // The invoice row says whose deal a reference belongs to. Each payment
  // attempt has its own reference, so the deal's own reference matches only
  // invoices raised before that was so.
  const invoice = await db.invoice.findUnique({
    where: { reference: orderId },
    select: { orderId: true, purpose: true, amountUsd: true },
  });
  const order = await db.order.findUnique({
    where: invoice?.orderId ? { id: invoice.orderId } : { reference: orderId },
    select: {
      id: true,
      totalUsd: true,
      paymentRef: true,
      buyerPaymentRef: true,
    },
  });

  if (!order) {
    console.warn(`[cryptomus] callback for unknown reference ${orderId}`);
    return "ignored";
  }

  await recordAudit({
    actorId: null,
    action: `payment.${outcome}`,
    entity: "order",
    entityId: order.id,
    after: {
      status,
      uuid: payload.uuid,
      paymentAmountUsd: payload.payment_amount_usd,
      payerCurrency: payload.payer_currency,
      txid: payload.txid,
    },
  });

  // The processor sent the payer's money back. If we had already applied
  // this payment, the hold on our books is now a claim about money that
  // has gone: left alone, the deal completes normally and credits the
  // seller out of it. Freeze it and put it in front of a human, because
  // reversing a hold is a decision rather than a sweep.
  // A Safest price invoice raised before the price went to the seller
  // directly. It can still be paid, and is credited to the buyer.
  const isPrice = invoice?.purpose === "DEAL_PRICE";

  if (outcome === "refunded") {
    await applyProcessorRefund({
      orderId: order.id,
      reference: orderId,
      status,
      via: "webhook",
    });
    return "ignored";
  }

  if (outcome !== "settled") return "ignored";

  // Confirm rather than trust. The signature says the body was not tampered
  // with in flight; this says Cryptomus genuinely considers it paid.
  const confirmed = await getInvoice(orderId);
  if (
    !confirmed ||
    classifyStatus(confirmed.status, confirmed.isFinal) !== "settled"
  ) {
    console.warn(
      `[cryptomus] ${orderId} claimed ${status} but the API says ${confirmed?.status ?? "nothing"}`,
    );
    return "unconfirmed";
  }

  // An underpayment must not start a deal. Cryptomus has its own
  // `wrong_amount` status for this, but a tolerance check here means a
  // rounding difference in its favour cannot fund a deal short. Owed is the
  // invoice's own amount: a Safest price compared with the order's total —
  // its fee — would pass for anything above $3. Invoices raised before they
  // were recorded per attempt have no row, and were for the whole total.
  const owed = invoice?.amountUsd ?? order.totalUsd;
  if (confirmed.paidAmountUsd !== null && confirmed.paidAmountUsd < owed) {
    console.warn(
      `[cryptomus] ${orderId} underpaid: ${confirmed.paidAmountUsd} < ${owed}`,
    );
    await recordAudit({
      actorId: null,
      action: "payment.underpaid",
      entity: "order",
      entityId: order.id,
      after: { paid: confirmed.paidAmountUsd, owed },
    });
    return "ignored";
  }

  // Our own reference, not Cryptomus's uuid. One payment must have one
  // name: the sweep applies the same payment under `invoice.reference`, and
  // two names for it meant the second caller saw an unfamiliar reference
  // and credited the buyer the whole deal out of nothing.
  await (isPrice ? recordStrayPricePayment : recordOpeningPayment)(
    order.id,
    orderId,
    confirmed.payerCurrency ?? "USDT",
  );
  return "applied";
}

/** Cryptomus only ever POSTs here; a GET is a probe or a misconfiguration. */
export async function GET() {
  return Response.json({ error: "method not allowed" }, { status: 405 });
}
