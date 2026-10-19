import "server-only";

import { randomBytes } from "node:crypto";
import type { InvoicePurpose } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { TERMINAL_STATUSES } from "@/lib/deal-machine";
import { recordAudit } from "@/server/audit";
import { classifyStatus, lookupInvoice } from "@/server/cryptomus";
import { recordOpeningPayment, recordStrayPricePayment } from "@/server/deals";
import { notifyStaff } from "@/server/notifications";
import { settleBadgePayment } from "@/server/reseller";
import { creditDeposit } from "@/server/wallet";

/**
 * The processor sent a deal payment back to the payer. What that means
 * depends on which payment it was.
 *
 * - **The one the deal was paid with** (the opening payment, or a Safest
 *   price): the hold on our books is now a claim about money that has gone,
 *   and left alone the deal would complete and pay the seller out of it. The
 *   deal is frozen in a dispute for a person to decide.
 * - **One we credited to the buyer's balance instead** — a second payment,
 *   or one that arrived after the deal had stopped: the buyer now has both
 *   the refund and the credit, so the credit is taken back. The deal, paid
 *   for properly, carries on.
 *
 * Either way the audit row is what `resolveDeal` later reads, so a refund
 * decided by staff never pays the buyer a second time. Shared by the webhook
 * and the sweep, which used to disagree: only the webhook froze anything.
 */
export async function applyProcessorRefund(input: {
  orderId: string;
  reference: string;
  status: string;
  via?: "webhook" | "reconcile";
}): Promise<"frozen" | "reversed" | "noted"> {
  const order = await db.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      buyerId: true,
      paymentRef: true,
      buyerPaymentRef: true,
    },
  });
  if (!order) return "noted";

  const applied =
    input.reference === order.paymentRef ||
    input.reference === order.buyerPaymentRef;

  let outcome: "frozen" | "reversed" | "noted" = "noted";
  let frozen = false;
  if (applied) {
    const moved = await db.order.updateMany({
      where: { id: order.id, status: { notIn: [...TERMINAL_STATUSES] } },
      data: { status: "DISPUTED" },
    });
    frozen = moved.count === 1;
    outcome = "frozen";
  } else {
    const credit = await db.ledgerEntry.findFirst({
      where: {
        orderId: order.id,
        userId: order.buyerId,
        kind: "DEPOSIT",
        externalRef: {
          in: [`overpay:${input.reference}`, `late:${input.reference}`],
        },
      },
      select: { amountUsd: true },
    });
    if (credit) {
      try {
        await db.ledgerEntry.create({
          data: {
            userId: order.buyerId,
            orderId: order.id,
            kind: "DEPOSIT",
            amountUsd: -credit.amountUsd,
            note: "Refunded to you by the processor, so taken back from your balance",
            externalRef: `reversed:${input.reference}`,
          },
        });
        outcome = "reversed";
      } catch (error) {
        // Told twice: the reversal already exists.
        if (!isUniqueViolation(error)) throw error;
      }
    }
  }

  await recordAudit({
    actorId: null,
    action: "payment.refunded_by_processor",
    entity: "order",
    entityId: order.id,
    after: {
      reference: input.reference,
      status: input.status,
      applied,
      frozen,
      reversed: outcome === "reversed",
      via: input.via ?? "webhook",
    },
  });

  if (outcome === "reversed") {
    await notifyStaff(["FINANCE"], (userId) => ({
      userId,
      kind: "PAYOUT",
      title: "A payment refunded by the processor was taken back",
      body: `Cryptomus refunded ${input.reference}, which we had credited to the buyer's balance. The credit has been reversed.`,
      href: "/admin/money",
    }));
  }
  return outcome;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * Invoices we have raised, and making sure each one lands.
 *
 * The webhook answers the processor quickly and does its work after the
 * response, which means a handler that throws loses the only retry the
 * processor was ever going to give us. So every invoice is written down when
 * it is created, and this sweep goes back over the ones that were paid and
 * never applied.
 *
 * It is the difference between "we think we were paid" and "the money reached
 * somebody's balance or somebody's deal", and only the second one is safe to
 * act on.
 */

/** A reference the processor will echo back. Unique, and ours to read. */
export function newReference(purpose: InvoicePurpose): string {
  const prefix =
    purpose === "TOPUP" ? "TOPUP" : purpose === "BADGE" ? "BADGE" : "DEAL";
  return `${prefix}-${randomBytes(9).toString("base64url")}`;
}

export async function recordInvoice(input: {
  reference: string;
  purpose: InvoicePurpose;
  amountUsd: number;
  userId: string;
  orderId?: string;
}): Promise<void> {
  // Idempotent on the reference, which is what makes it safe for a buyer
  // to press pay twice. Any *other* failure is raised: this row is the
  // only evidence a second payment is ever credited against, and the
  // reconciliation sweep has nothing to chase without it, so swallowing a
  // transient database error here loses money quietly later.
  await db.invoice.upsert({
    where: { reference: input.reference },
    create: {
      reference: input.reference,
      purpose: input.purpose,
      amountUsd: input.amountUsd,
      userId: input.userId,
      orderId: input.orderId ?? null,
    },
    update: {},
  });
}

/** Note what a callback said, whether or not it could be acted on. */
export async function noteCallback(
  reference: string,
  status: string,
  externalId: string | null,
): Promise<void> {
  await db.invoice.updateMany({
    where: { reference },
    data: {
      lastStatus: status,
      externalId: externalId ?? undefined,
      // Only ever set, never cleared. A refund or cancellation callback
      // arriving after a payment settled must not erase the record that it
      // settled — that is the evidence a second payment is weighed against.
      settledAt:
        status === "paid" || status === "paid_over" ? new Date() : undefined,
    },
  });
}

/** Mark an invoice as having actually been applied. */
export async function markApplied(reference: string): Promise<void> {
  await db.invoice.updateMany({
    where: { reference, appliedAt: null },
    data: { appliedAt: new Date() },
  });
}

/**
 * Re-check invoices that were raised and never applied.
 *
 * Runs from the scheduled sweep. Deliberately asks the processor rather than
 * trusting `lastStatus`: an invoice with no callback at all is exactly the
 * case this exists for, because a lost callback leaves no status behind.
 *
 * Idempotent at every step — `recordOpeningPayment` claims a null paymentRef
 * and `creditDeposit` claims a unique externalRef — so re-applying something
 * that did land is a no-op rather than a double credit.
 */
export async function reconcileInvoices(limit = 25): Promise<number> {
  // Give the callback a few minutes to arrive before chasing it.
  const cutoff = new Date(Date.now() - 5 * 60 * 1000);

  // Least recently looked at first, and every invoice looked at is touched,
  // so the queue rotates. Ordering by createdAt meant the 25 oldest
  // unresolvable invoices sat at the front for ever and every paid invoice
  // behind them was never reached.
  const pending = await db.invoice.findMany({
    where: { appliedAt: null, createdAt: { lt: cutoff } },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: INVOICE_FOR_RECONCILE,
  });

  let applied = 0;
  for (const invoice of pending) {
    try {
      if (await reconcileOne(invoice)) applied += 1;
    } catch (error) {
      // One bad invoice must not stop the sweep.
      console.error(`[invoices] reconciling ${invoice.reference}`, error);
    }
  }

  return applied;
}

const INVOICE_FOR_RECONCILE = {
  id: true,
  reference: true,
  purpose: true,
  amountUsd: true,
  userId: true,
  orderId: true,
  lastStatus: true,
  createdAt: true,
} as const;

/**
 * How long an invoice can go unheard-of at the processor before it is
 * taken to have never existed there. Cryptomus invoices live one hour, so
 * after two days with no callback and no record, there is nothing to pay.
 */
const NEVER_REGISTERED_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * One invoice, by reference, whenever somebody asks.
 *
 * For the money desk: a buyer says they paid and the deal says they did
 * not. Without this the only remedy was waiting for the sweep to reach it,
 * and a missed top-up had no remedy a person could use at all.
 */
export async function reconcileInvoice(
  reference: string,
): Promise<"applied" | "not-yet" | "not-found" | "already-applied"> {
  const invoice = await db.invoice.findUnique({
    where: { reference },
    select: { ...INVOICE_FOR_RECONCILE, appliedAt: true },
  });
  if (!invoice) return "not-found";
  if (invoice.appliedAt) return "already-applied";
  return (await reconcileOne(invoice)) ? "applied" : "not-yet";
}

async function reconcileOne(invoice: {
  id: string;
  reference: string;
  purpose: InvoicePurpose;
  amountUsd: number;
  userId: string;
  orderId: string | null;
  lastStatus: string | null;
  createdAt: Date;
}): Promise<boolean> {
  // Touched first, so whatever happens below this goes to the back of the
  // queue rather than blocking the front.
  await db.invoice.update({
    where: { id: invoice.id },
    data: { updatedAt: new Date() },
  });

  const lookup = await lookupInvoice(invoice.reference);
  if (lookup.kind !== "found") {
    // The processor says it has no such invoice, nothing ever called back
    // about it, and it is old enough that it could not still be paid: it was
    // never created there. Usually a top-up whose page the buyer never
    // reached. Not being able to ask is not that answer.
    const age = Date.now() - invoice.createdAt.getTime();
    if (
      lookup.kind === "missing" &&
      !invoice.lastStatus &&
      age > NEVER_REGISTERED_AFTER_MS
    ) {
      await markApplied(invoice.reference);
      await recordAudit({
        actorId: null,
        action: "payment.never_registered",
        entity: invoice.orderId ? "order" : "user",
        entityId: invoice.orderId ?? invoice.userId,
        after: { reference: invoice.reference },
      });
    }
    return false;
  }

  const confirmed = lookup.invoice;
  const outcome = classifyStatus(confirmed.status, confirmed.isFinal);
  if (outcome !== "settled") {
    // Dead invoices stop being chased; a pending one is looked at again.
    if (outcome === "dead") await markApplied(invoice.reference);

    // A refund is neither. The money reached us and went back, so if we
    // applied it there is a hold on the books that is no longer real.
    if (outcome === "refunded") {
      if (invoice.orderId) {
        await applyProcessorRefund({
          orderId: invoice.orderId,
          reference: invoice.reference,
          status: confirmed.status,
          via: "reconcile",
        });
      } else {
        await recordAudit({
          actorId: null,
          action: "payment.refunded_by_processor",
          entity: "user",
          entityId: invoice.userId,
          after: {
            reference: invoice.reference,
            status: confirmed.status,
            via: "reconcile",
          },
        });
      }
      await markApplied(invoice.reference);
    }
    return false;
  }

  if (invoice.purpose === "BADGE") {
    if (confirmed.paidAmountUsd === null || confirmed.paidAmountUsd <= 0) {
      return false;
    }
    // Into the balance, then spent on the pass: the webhook's own path.
    await settleBadgePayment(
      invoice.reference,
      confirmed.paidAmountUsd,
      confirmed.payerCurrency ?? "USDT",
    );
  } else if (invoice.purpose === "TOPUP") {
    if (confirmed.paidAmountUsd === null || confirmed.paidAmountUsd <= 0) {
      return false;
    }
    await creditDeposit(
      invoice.userId,
      confirmed.paidAmountUsd,
      invoice.reference,
      confirmed.payerCurrency ?? "USDT",
    );
  } else if (invoice.orderId) {
    // The same tolerance check the webhook makes. Without it, the
    // cheapest way to get an agent to take custody of a channel was to
    // underpay and make sure the callback never arrived — this is the
    // path that runs when it does not.
    //
    // Owed is what this invoice was raised for — the opening payment or,
    // on Safest, the price — not the order's up-front total.
    const order = await db.order.findUnique({
      where: { id: invoice.orderId },
      select: { id: true },
    });
    if (!order) return false;
    if (
      confirmed.paidAmountUsd !== null &&
      confirmed.paidAmountUsd < invoice.amountUsd
    ) {
      await recordAudit({
        actorId: null,
        action: "payment.underpaid",
        entity: "order",
        entityId: invoice.orderId,
        after: {
          paid: confirmed.paidAmountUsd,
          owed: invoice.amountUsd,
          via: "reconcile",
        },
      });
      return false;
    }

    // The processor's own lookup is the settlement evidence here, as the
    // callback is on the webhook path. A second payment is credited only
    // against a settled invoice, and this path never stamped one — so a
    // second payment only the sweep saw was booked nowhere.
    await db.invoice.updateMany({
      where: { id: invoice.id, settledAt: null },
      data: { settledAt: new Date(), lastStatus: confirmed.status },
    });

    // A Safest price invoice from before the price went to the seller
    // directly: the buyer's balance, never a step.
    const record =
      invoice.purpose === "DEAL_PRICE"
        ? recordStrayPricePayment
        : recordOpeningPayment;
    const outcome = await record(
      invoice.orderId,
      invoice.reference,
      confirmed.payerCurrency ?? "USDT",
    );
    // Booked nowhere: leave the invoice open, on the "paid, not applied"
    // list, for a person. Marking it applied hid real money for good.
    if (outcome === "reference-mismatch") return false;
  } else {
    return false;
  }

  await markApplied(invoice.reference);
  await recordAudit({
    actorId: null,
    action: "payment.reconciled",
    entity:
      invoice.purpose === "TOPUP" || invoice.purpose === "BADGE"
        ? "user"
        : "order",
    entityId: invoice.orderId ?? invoice.userId,
    after: { reference: invoice.reference, status: confirmed.status },
  });
  return true;
}
