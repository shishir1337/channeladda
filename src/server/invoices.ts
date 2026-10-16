import "server-only";

import { randomBytes } from "node:crypto";
import type { InvoicePurpose } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { recordAudit } from "@/server/audit";
import { classifyStatus, getInvoice } from "@/server/cryptomus";
import { recordOpeningPayment } from "@/server/deals";
import { creditDeposit } from "@/server/wallet";

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
  const prefix = purpose === "TOPUP" ? "TOPUP" : "DEAL";
  return `${prefix}-${randomBytes(9).toString("base64url")}`;
}

export async function recordInvoice(input: {
  reference: string;
  purpose: InvoicePurpose;
  amountUsd: number;
  userId: string;
  orderId?: string;
}): Promise<void> {
  await db.invoice.create({
    data: {
      reference: input.reference,
      purpose: input.purpose,
      amountUsd: input.amountUsd,
      userId: input.userId,
      orderId: input.orderId ?? null,
    },
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
      settledAt:
        status === "paid" || status === "paid_over" ? new Date() : null,
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

  const pending = await db.invoice.findMany({
    where: { appliedAt: null, createdAt: { lt: cutoff } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      reference: true,
      purpose: true,
      userId: true,
      orderId: true,
    },
  });

  let applied = 0;
  for (const invoice of pending) {
    try {
      const confirmed = await getInvoice(invoice.reference);
      if (!confirmed) continue;

      const outcome = classifyStatus(confirmed.status, confirmed.isFinal);
      if (outcome !== "settled") {
        // Dead invoices stop being chased; a pending one is looked at again.
        if (outcome === "dead") await markApplied(invoice.reference);
        continue;
      }

      if (invoice.purpose === "TOPUP") {
        if (confirmed.paidAmountUsd === null || confirmed.paidAmountUsd <= 0) {
          continue;
        }
        await creditDeposit(
          invoice.userId,
          confirmed.paidAmountUsd,
          invoice.reference,
          confirmed.payerCurrency ?? "USDT",
        );
      } else if (invoice.orderId) {
        await recordOpeningPayment(
          invoice.orderId,
          invoice.reference,
          confirmed.payerCurrency ?? "USDT",
        );
      } else {
        continue;
      }

      await markApplied(invoice.reference);
      await recordAudit({
        actorId: null,
        action: "payment.reconciled",
        entity: invoice.purpose === "TOPUP" ? "user" : "order",
        entityId: invoice.orderId ?? invoice.userId,
        after: { reference: invoice.reference, status: confirmed.status },
      });
      applied += 1;
    } catch (error) {
      // One bad invoice must not stop the sweep.
      console.error(`[invoices] reconciling ${invoice.reference}`, error);
    }
  }

  return applied;
}
