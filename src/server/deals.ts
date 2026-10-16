import "server-only";

import type { DealMode } from "@/generated/prisma/enums";
import { canTransition } from "@/lib/deal-machine";
import { OPENING_STATUS, templateFor } from "@/lib/deal-templates";
import { db } from "@/lib/db";
import { orderAmounts } from "@/lib/fees";
import { getSettings } from "@/server/settings";

/**
 * Deals.
 *
 * The rule everything here exists to protect: **a deal must never leave one
 * side exposed.** In a Safest deal that means the buyer's money and the
 * seller's channel are never both out of their owner's hands at once — the
 * agent holds the channel, and the buyer pays while they still hold it. In a
 * Fastest deal it means the platform holds the whole amount until the buyer
 * confirms they have access.
 *
 * Decisions about *who may do what* are not made here. They live in
 * `@/lib/deal-machine`, which is pure and exhaustively tested. This file does
 * the writing down.
 */

export type DealFailure =
  | "not-found"
  | "not-live"
  | "own-listing"
  | "taken"
  | "wrong-actor"
  | "wrong-step"
  | "terminal"
  | "cap-reached"
  | "needs-approval";

export type DealOutcome<T = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; reason: DealFailure };

/** Thrown inside a transaction to roll it back with a reason attached. */
class DealAbort extends Error {
  constructor(readonly reason: DealFailure) {
    super(reason);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Human-facing, and short enough to read down a phone. Five digits is 90,000
 * references, which is plenty while collisions are retried rather than
 * assumed away.
 */
function newReference(): string {
  return `CA-${Math.floor(10_000 + Math.random() * 90_000)}`;
}

/** A user's balance is the sum of their own ledger rows, and only theirs. */
export async function balanceOf(userId: string): Promise<number> {
  const { _sum } = await db.ledgerEntry.aggregate({
    where: { userId },
    _sum: { amountUsd: true },
  });
  return _sum.amountUsd ?? 0;
}

export async function createDeal(input: {
  listingId: string;
  buyerId: string;
  mode: DealMode;
}): Promise<DealOutcome<{ orderId: string; reference: string }>> {
  const listing = await db.listing.findUnique({
    where: { id: input.listingId },
    select: { id: true, sellerId: true, status: true, priceUsd: true },
  });

  if (!listing) return { ok: false, reason: "not-found" };
  if (listing.sellerId === input.buyerId) {
    return { ok: false, reason: "own-listing" };
  }
  if (listing.status !== "LIVE") return { ok: false, reason: "not-live" };

  const settings = await getSettings();
  const amounts = orderAmounts(listing.priceUsd, settings, input.mode);
  const steps = templateFor(input.mode);

  // Retried only for a reference collision. Everything else either succeeds or
  // is a decision, and re-running it would not change the answer.
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newReference();
    try {
      const orderId = await db.$transaction(async (tx) => {
        // Compare-and-set, not read-then-write: two buyers pressing buy at the
        // same moment must not both end up with an order. A zero row count
        // means somebody else got there between the read above and here.
        const reserved = await tx.listing.updateMany({
          where: { id: listing.id, status: "LIVE" },
          data: { status: "RESERVED" },
        });
        if (reserved.count !== 1) throw new DealAbort("taken");

        const order = await tx.order.create({
          data: {
            reference,
            listingId: listing.id,
            buyerId: input.buyerId,
            sellerId: listing.sellerId,
            mode: input.mode,
            status: "AWAITING_PAYMENT",
            priceUsd: amounts.priceUsd,
            buyerFeeUsd: amounts.buyerFeeUsd,
            sellerFeeUsd: amounts.sellerFeeUsd,
            totalUsd: amounts.totalUsd,
            steps: {
              create: steps.map((step) => ({
                position: step.position,
                label: step.label,
                actor: step.actor,
              })),
            },
          },
          select: { id: true },
        });

        return order.id;
      });

      return { ok: true, orderId, reference };
    } catch (error) {
      if (error instanceof DealAbort) return { ok: false, reason: error.reason };
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }

  throw new Error(
    "Could not allocate a unique deal reference after five attempts.",
  );
}

/**
 * The buyer's opening payment has cleared.
 *
 * Called by an admin action today and by the Cryptomus webhook once that
 * exists, which is why it is idempotent on the payment reference: a webhook
 * that fires twice must not charge two fees or write two ledger rows.
 */
export async function recordOpeningPayment(
  orderId: string,
  ref: string,
  asset: string,
): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      mode: true,
      status: true,
      paymentRef: true,
      totalUsd: true,
      buyerFeeUsd: true,
    },
  });

  if (!order) throw new Error(`No such order: ${orderId}`);

  // Same reference twice: the first one already did the work.
  if (order.paymentRef === ref) return;

  // A different reference on an order that is already paid is not a retry, it
  // is a second payment. Refusing loudly beats quietly double-crediting.
  if (order.paymentRef) {
    throw new Error(
      `Order ${order.id} is already paid under ${order.paymentRef}; refusing ${ref}.`,
    );
  }

  const target = OPENING_STATUS[order.mode];
  if (!canTransition(order.mode, order.status, target, "system")) {
    throw new Error(
      `Cannot record payment on ${order.id}: ${order.status} does not lead to ${target}.`,
    );
  }

  // Safest records only the platform's fee. The channel price goes straight
  // from buyer to seller and never passes through the platform, so a ledger
  // row for it would be a claim about money the platform never held.
  const ledger =
    order.mode === "FASTEST"
      ? { kind: "ESCROW_HOLD" as const, amountUsd: order.totalUsd }
      : { kind: "BUYER_FEE" as const, amountUsd: order.buyerFeeUsd };

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: target,
        paymentRef: ref,
        paymentAsset: asset,
        paidAt: now,
        feePaidAt: now,
      },
    });

    await tx.transferStep.updateMany({
      where: { orderId: order.id, position: 1, completedAt: null },
      data: { completedAt: now },
    });

    await tx.ledgerEntry.create({
      data: {
        orderId: order.id,
        // Platform-held funds and platform revenue carry no userId, so they
        // never count towards anybody's withdrawable balance.
        userId: null,
        kind: ledger.kind,
        amountUsd: ledger.amountUsd,
        note: `${order.mode} opening payment`,
      },
    });
  });
}
