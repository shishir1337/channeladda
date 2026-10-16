import { after } from "next/server";
import { verifyWebhookSign } from "@/lib/cryptomus-sign";
import { db } from "@/lib/db";
import { recordAudit } from "@/server/audit";
import {
  classifyStatus,
  cryptomusConfig,
  getInvoice,
} from "@/server/cryptomus";
import { recordOpeningPayment } from "@/server/deals";
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

  // The heavy work happens after the response. Cryptomus counts a slow reply
  // as a failure and retries, and a confirmation round trip plus a database
  // transaction is slower than its patience.
  after(async () => {
    try {
      await handle(orderId, status, outcome, payload);
    } catch (error) {
      console.error(`[cryptomus] handling ${orderId}`, error);
    }
  });

  return Response.json({ ok: true });
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
) {
  if (outcome !== "settled") return;

  const suffix = reference.split("-")[1];
  if (!suffix) return;

  const user = await db.user.findFirst({
    where: { id: { endsWith: suffix } },
    select: { id: true },
  });
  if (!user) {
    console.warn(`[cryptomus] top-up ${reference} matches no user`);
    return;
  }

  const confirmed = await getInvoice(reference);
  if (
    !confirmed ||
    classifyStatus(confirmed.status, confirmed.isFinal) !== "settled" ||
    confirmed.paidAmountUsd === null ||
    confirmed.paidAmountUsd <= 0
  ) {
    console.warn(`[cryptomus] top-up ${reference} did not confirm`);
    return;
  }

  // Credited at what actually arrived, not at what was asked for: an
  // overpayment is still the payer's money.
  await creditDeposit(
    user.id,
    confirmed.paidAmountUsd,
    reference,
    confirmed.payerCurrency ?? "USDT",
  );
}

async function handle(
  orderId: string,
  status: string,
  outcome: ReturnType<typeof classifyStatus>,
  payload: Record<string, unknown>,
) {
  if (orderId.startsWith("TOPUP-")) {
    await handleTopUp(orderId, outcome);
    return;
  }

  const order = await db.order.findUnique({
    where: { reference: orderId },
    select: { id: true, totalUsd: true, paymentRef: true },
  });

  if (!order) {
    console.warn(`[cryptomus] callback for unknown reference ${orderId}`);
    return;
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

  if (outcome !== "settled") return;

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
    return;
  }

  // An underpayment must not start a deal. Cryptomus has its own
  // `wrong_amount` status for this, but a tolerance check here means a
  // rounding difference in its favour cannot fund a deal short.
  if (
    confirmed.paidAmountUsd !== null &&
    confirmed.paidAmountUsd < order.totalUsd
  ) {
    console.warn(
      `[cryptomus] ${orderId} underpaid: ${confirmed.paidAmountUsd} < ${order.totalUsd}`,
    );
    await recordAudit({
      actorId: null,
      action: "payment.underpaid",
      entity: "order",
      entityId: order.id,
      after: { paid: confirmed.paidAmountUsd, owed: order.totalUsd },
    });
    return;
  }

  const uuid = typeof payload.uuid === "string" ? payload.uuid : orderId;
  await recordOpeningPayment(order.id, uuid, confirmed.payerCurrency ?? "USDT");
}

/** Cryptomus only ever POSTs here; a GET is a probe or a misconfiguration. */
export async function GET() {
  return Response.json({ error: "method not allowed" }, { status: 405 });
}
