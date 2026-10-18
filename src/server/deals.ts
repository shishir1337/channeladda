import "server-only";

import { platformMap } from "@/data/platforms";
import type { DealMode, OrderStatus, UserRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import {
  AGENT_HOLDS,
  canTransition,
  type DealActor,
  isTerminal,
  TERMINAL_STATUSES,
} from "@/lib/deal-machine";
import {
  OPENING_STATUS,
  priceStepFor,
  templateFor,
} from "@/lib/deal-templates";
import { orderAmounts } from "@/lib/fees";
import { keptFee, requiredHold } from "@/lib/holds";
import { isSerializationFailure } from "@/lib/serialization-failure";
import { keyFromUrl } from "@/lib/upload-keys";
import { recordAudit } from "@/server/audit";
import { ensureConversation, postEvent } from "@/server/chat-events";
import { notifyDealEnded, notifyNextActor } from "@/server/deal-notify";
import { notifyStaff } from "@/server/notifications";
import {
  heldByAcceptedOffer,
  notifyClosedOffers,
  releaseLapsedOfferReservations,
} from "@/server/offers";
import { getSettings } from "@/server/settings";
import { markUploadsAttached } from "@/server/upload-access";

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
  | "needs-approval"
  /** The opening payment has not cleared, so nothing may move yet. */
  | "not-paid"
  /** Frozen while staff decide a dispute. */
  | "disputed"
  /** Reversing a handover is an adjudication, so it needs a dispute. */
  | "needs-dispute"
  /** Finishing a deal is the last step’s job, not a shortcut past it. */
  | "not-disputed"
  /** Moving money out of the platform's hands is the finance desk's. */
  | "needs-finance"
  /** The channel is ours to give back, so it cannot just be abandoned. */
  | "in-custody"
  /** A payment completes this step when it reaches us; nobody presses it. */
  | "pay-in-checkout"
  /** The recovery hold on this platform has not ended yet. */
  | "on-hold"
  /**
   * The platform's hold on this deal is not what the deal says it should
   * be, so nothing is paid out or refunded until staff have looked.
   */
  | "books-mismatch"
  | "bad-proof";

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
 * Proof links are rendered as anchors in the deal timeline, where the other
 * party clicks them inside their own authenticated session. Only this app's
 * own upload paths and plain web links are allowed, because `javascript:` and
 * `data:` in that position are script execution, not a screenshot.
 */
function isSafeProofUrl(url: string): boolean {
  // Our own uploads have to be a key we actually serve, not merely a
  // string beginning `/uploads/`.
  if (url.startsWith("/uploads/")) return keyFromUrl(url) !== null;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * What the platform itself is holding on one deal, in cents.
 *
 * Rows with no `userId` are the platform's own position, so this must net to
 * the fee on a completed deal and to zero on a refunded one. Anything else
 * means the books claim to hold money that has been paid away.
 */
export async function platformPositionFor(orderId: string): Promise<number> {
  const { _sum } = await db.ledgerEntry.aggregate({
    where: { orderId, userId: null },
    _sum: { amountUsd: true },
  });
  return _sum.amountUsd ?? 0;
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * How much of a deal's applied payments the processor has refunded to the
 * payer itself, by the audit rows the webhook and the sweep write when
 * Cryptomus reports one. Only a payment applied to this deal counts — an
 * invoice refunded before it ever landed was never on the deal's books.
 */
async function refundedByProcessor(
  tx: Tx,
  order: {
    id: string;
    paymentRef: string | null;
    buyerPaymentRef: string | null;
  },
): Promise<number> {
  const rows = await tx.auditLog.findMany({
    where: {
      entity: "order",
      entityId: order.id,
      action: "payment.refunded_by_processor",
    },
    select: { after: true },
  });
  const refunded = new Set(
    rows.flatMap((row) => {
      const after = row.after as { reference?: unknown } | null;
      return typeof after?.reference === "string" ? [after.reference] : [];
    }),
  );
  const applied = [order.paymentRef, order.buyerPaymentRef].filter(
    (ref): ref is string => ref !== null && refunded.has(ref),
  );
  if (applied.length === 0) return 0;
  const invoices = await tx.invoice.findMany({
    where: { reference: { in: applied } },
    select: { amountUsd: true },
  });
  return invoices.reduce((sum, invoice) => sum + invoice.amountUsd, 0);
}

/**
 * What the platform is holding for a deal's buyer right now: its holds, less
 * what has been released or refunded. Earned fees are not in it — they are
 * the platform's, not the buyer's.
 *
 * Read inside the transaction that is about to move the money, so the
 * check and the movement see the same rows.
 */
async function platformHoldFor(tx: Tx, orderId: string): Promise<number> {
  const { _sum } = await tx.ledgerEntry.aggregate({
    where: {
      orderId,
      userId: null,
      kind: { in: ["ESCROW_HOLD", "ESCROW_RELEASE", "REFUND"] },
    },
    _sum: { amountUsd: true },
  });
  return _sum.amountUsd ?? 0;
}

/**
 * The second pair of eyes on a step that hands value across.
 *
 * Must be someone else, and must be staff: an agent who could nominate
 * themselves, or nominate the buyer, would not be a control at all.
 */
async function validApprover(
  approvedById: string | undefined,
  actingUserId: string,
): Promise<string | null> {
  if (!approvedById || approvedById === actingUserId) return null;
  const approver = await db.user.findUnique({
    where: { id: approvedById },
    select: { role: true, bannedAt: true },
  });
  if (!approver || approver.bannedAt) return null;
  return STAFF_ROLES.includes(approver.role) ? approvedById : null;
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
  /** The buyer ticked the revenue-risk box at checkout. */
  acceptedRevenueRisk?: boolean;
}): Promise<DealOutcome<{ orderId: string; reference: string }>> {
  const listing = await db.listing.findUnique({
    where: { id: input.listingId },
    select: { id: true, sellerId: true, status: true, priceUsd: true },
  });

  if (!listing) return { ok: false, reason: "not-found" };
  if (listing.sellerId === input.buyerId) {
    return { ok: false, reason: "own-listing" };
  }

  // A listing held by somebody's abandoned deal is the one case worth paying
  // for a write on a read path: without it, opening a deal and walking away
  // takes a listing off the market for good, and anybody could do that to
  // every listing on the site for the price of nothing. Checked here, where
  // the next buyer actually hits it, rather than waiting for a scheduler.
  //
  // An accepted offer is the other thing that reserves a listing, and the
  // buyer who holds one is exactly who should be let through: the deal opens
  // at the agreed price. Refusing them — which this used to do — left the
  // listing reserved for a deal that could never be opened.
  let offer: { id: string; amountUsd: number } | null = null;
  if (listing.status === "RESERVED") {
    offer = await heldByAcceptedOffer(listing.id, input.buyerId);
    if (!offer) {
      const freed =
        (await expireStaleDealsForListing(listing.id)) +
        (await releaseLapsedOfferReservations(listing.id));
      if (freed > 0) {
        const again = await db.listing.findUnique({
          where: { id: listing.id },
          select: { status: true },
        });
        if (again?.status === "LIVE") listing.status = "LIVE";
      }
    }
  }

  if (!offer && listing.status !== "LIVE") {
    return { ok: false, reason: "not-live" };
  }

  const settings = await getSettings();
  const amounts = orderAmounts(
    offer ? offer.amountUsd : listing.priceUsd,
    settings,
    input.mode,
  );
  const steps = templateFor(input.mode);
  const buyer = await db.user.findUnique({
    where: { id: input.buyerId },
    select: { name: true },
  });

  // Retried only for a reference collision. Everything else either succeeds or
  // is a decision, and re-running it would not change the answer.
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newReference();
    try {
      const { orderId, closed } = await db.$transaction(async (tx) => {
        // Compare-and-set, not read-then-write: two buyers pressing buy at the
        // same moment must not both end up with an order. A zero row count
        // means somebody else got there between the read above and here.
        //
        // From an accepted offer the listing is already reserved — by the
        // offer — so the check is that it still is, and that no live deal
        // has been opened against it in the meantime. The unique offerId on
        // the order then makes a second deal off the same acceptance
        // impossible rather than merely unlikely.
        if (offer) {
          const stillHeld = await tx.listing.count({
            where: { id: listing.id, status: "RESERVED" },
          });
          const live = await tx.order.count({
            where: {
              listingId: listing.id,
              status: { notIn: [...TERMINAL_STATUSES] },
            },
          });
          if (stillHeld !== 1 || live > 0) throw new DealAbort("taken");
        } else {
          const reserved = await tx.listing.updateMany({
            where: { id: listing.id, status: "LIVE" },
            data: { status: "RESERVED" },
          });
          if (reserved.count !== 1) throw new DealAbort("taken");
        }

        // The 10-day chat purge carves out threads with an order on them, and
        // nothing ever wrote that link — so the carve-out could never fire,
        // and every deal's conversation was deleted after ten days. That
        // conversation is what the dispute process and the refund policy both
        // call the only account of what was agreed.
        //
        // Every deal has one now: a buyer who never wrote to the seller gets
        // the thread here, so the agent has somewhere to talk to both. The
        // link lives on the deal, not the thread, so a second deal opened in
        // the same conversation after the first lapsed is linked too. Inside
        // the transaction: if the order rolls back, the link does too.
        const conversationId = await ensureConversation(tx, {
          listingId: listing.id,
          buyerId: input.buyerId,
          sellerId: listing.sellerId,
        });
        const now = new Date();

        // Anybody still waiting on an offer hears a decision rather than
        // nothing. Without this a buyer could watch “waiting on seller” for
        // up to thirty days on a channel somebody else had already bought.
        //
        // One at a time, so each closes with a line in its own conversation.
        // The buyer opening this deal is not "declined": their own open offer
        // is one they have just superseded, so it reads as withdrawn.
        const open = await tx.offer.findMany({
          where: { listingId: listing.id, status: "OPEN" },
          select: { id: true, buyerId: true, amountUsd: true },
        });
        const closed: {
          buyerId: string;
          amountUsd: number;
          thread: string | null;
        }[] = [];
        for (const other of open) {
          const own = other.buyerId === input.buyerId;
          const moved = await tx.offer.updateMany({
            where: { id: other.id, status: "OPEN" },
            data: { status: own ? "WITHDRAWN" : "REJECTED", respondedAt: now },
          });
          if (moved.count !== 1 || own) continue;
          const thread = await tx.conversation.findUnique({
            where: {
              listingId_buyerId: {
                listingId: listing.id,
                buyerId: other.buyerId,
              },
            },
            select: { id: true },
          });
          if (thread) {
            await postEvent(tx, {
              conversationId: thread.id,
              kind: "EVENT",
              event: {
                type: "offer-auto-declined",
                amountCents: other.amountUsd,
              },
              senderId: null,
              offerId: other.id,
              at: now,
            });
          }
          closed.push({ ...other, thread: thread?.id ?? null });
        }

        const order = await tx.order.create({
          data: {
            reference,
            listingId: listing.id,
            buyerId: input.buyerId,
            sellerId: listing.sellerId,
            conversationId,
            mode: input.mode,
            status: "AWAITING_PAYMENT",
            offerId: offer?.id ?? null,
            priceUsd: amounts.priceUsd,
            buyerFeeUsd: amounts.buyerFeeUsd,
            sellerFeeUsd: amounts.sellerFeeUsd,
            totalUsd: amounts.totalUsd,
            // The consent three published policies say we collect. The
            // column has existed since the schema was written and nothing
            // ever wrote it, so a dispute about lost monetization was
            // refused on the strength of an acknowledgement we could not
            // produce.
            revenueRiskAcceptedAt: input.acceptedRevenueRisk
              ? new Date()
              : null,
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

        await postEvent(tx, {
          conversationId,
          kind: "EVENT",
          event: {
            type: "deal-opened",
            name: buyer?.name ?? "",
            mode: input.mode,
            reference,
            priceCents: amounts.priceUsd,
          },
          senderId: input.buyerId,
          orderId: order.id,
          at: now,
        });

        return { orderId: order.id, closed };
      });

      await notifyClosedOffers(closed);

      await recordAudit({
        actorId: input.buyerId,
        action: "deal.created",
        entity: "order",
        entityId: orderId,
        after: {
          mode: input.mode,
          reference,
          totalUsd: amounts.totalUsd,
          ...(offer ? { fromOffer: offer.id } : {}),
        },
      });

      return { ok: true, orderId, reference };
    } catch (error) {
      if (error instanceof DealAbort)
        return { ok: false, reason: error.reason };
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
/**
 * What recording a payment actually did.
 *
 * It used to return void, so every caller said the same cheerful thing
 * whatever happened underneath — including a finance clerk being told “the
 * deal is under way” for a payment that had just been audited as a reference
 * mismatch and credited to nobody.
 */
export type PaymentOutcome =
  /** The deal was waiting for this, and it is now under way. */
  | "applied"
  /** The same payment, delivered again. The first one did the work. */
  | "already-applied"
  /** A second, separate payment with its own settled invoice. Credited. */
  | "second-payment-credited"
  /** A reference we do not recognise on a deal already paid. Nothing done. */
  | "reference-mismatch"
  /** The deal could not accept it, so it became the buyer's balance. */
  | "credited-to-balance"
  /**
   * Refused before anything was written: a Cryptomus invoice for this
   * payment is open or already paid, so the money finance saw may be that
   * one. Recording it by hand as well is how one payment got credited twice.
   */
  | "invoice-open";

/**
 * Whether a checkout invoice for this payment could be the money finance is
 * about to record by hand: still open, so the buyer may be paying it, or
 * already paid. A dead or never-paid invoice is neither.
 */
async function checkoutInPlay(
  orderId: string,
  purpose: "DEAL" | "DEAL_PRICE",
): Promise<boolean> {
  const count = await db.invoice.count({
    where: {
      orderId,
      purpose,
      OR: [{ appliedAt: null }, { settledAt: { not: null } }],
    },
  });
  return count > 0;
}
/**
 * Finance recording a payment that reached us outside Cryptomus.
 *
 * The clerk types a transaction id, and that used to become the order's
 * payment reference. It cannot: the webhook and the reconciliation sweep both
 * name a payment by our own `CA-#####` reference, so a typed txid created a
 * third name for the same money — and the next caller to arrive saw an
 * unfamiliar reference, decided a second payment had landed, and credited the
 * buyer the whole deal. Mis-key the txid once and the deal pays for itself.
 *
 * The order's own reference is the payment's name. What the clerk typed is
 * kept in the audit trail, where a reconciliation needs it and nothing
 * branches on it.
 */
export async function recordManualPayment(
  orderId: string,
  txid: string,
  asset: string,
): Promise<PaymentOutcome> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { reference: true },
  });
  if (!order) throw new Error(`No such order: ${orderId}`);

  if (await checkoutInPlay(orderId, "DEAL")) {
    await recordAudit({
      actorId: null,
      action: "payment.manual_refused",
      entity: "order",
      entityId: orderId,
      after: { txid, asset, reason: "invoice-open" },
    });
    return "invoice-open";
  }

  await recordAudit({
    actorId: null,
    action: "payment.recorded_by_hand",
    entity: "order",
    entityId: orderId,
    after: { txid, asset, reference: order.reference },
  });

  return recordOpeningPayment(orderId, order.reference, asset);
}
/**
 * A second payment that arrived for a deal somebody had already paid.
 *
 * Credited to the payer's balance rather than refused, because the money is
 * real and it is theirs — a buyer can open an invoice, pay the deal from
 * their balance while it is still open, and then pay the invoice too.
 *
 * What it will **not** do is credit on the strength of an unfamiliar
 * reference. Three callers used to reach `recordOpeningPayment` with three
 * different names for the same payment — the webhook with Cryptomus's uuid,
 * the sweep with our own CA-##### reference, a clerk with a typed txid — so
 * whichever ran second saw a reference it did not recognise, decided a second
 * payment had arrived, and credited the buyer the whole deal out of nothing.
 * A credit now needs a settled invoice of its own to point at. No invoice
 * means the reference is wrong, not that money appeared.
 */
async function creditSecondPayment(
  order: {
    id: string;
    buyerId: string;
    totalUsd: number;
    paymentRef: string | null;
  },
  ref: string,
  asset: string,
): Promise<PaymentOutcome> {
  const invoice = await db.invoice.findUnique({
    where: { reference: ref },
    select: { orderId: true, amountUsd: true, settledAt: true },
  });

  if (!invoice || invoice.orderId !== order.id || !invoice.settledAt) {
    // The same payment under another name. Record it and change nothing.
    await recordAudit({
      actorId: null,
      action: "payment.reference_mismatch",
      entity: "order",
      entityId: order.id,
      after: { offered: ref, alreadyPaidUnder: order.paymentRef },
    });
    return "reference-mismatch";
  }

  const externalRef = `overpay:${ref}`;
  try {
    await db.ledgerEntry.create({
      data: {
        userId: order.buyerId,
        orderId: order.id,
        kind: "DEPOSIT",
        amountUsd: invoice.amountUsd,
        note: `Paid twice for this deal; credited to your balance (${asset})`,
        externalRef,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return "already-applied";
    throw error;
  }

  await recordAudit({
    actorId: null,
    action: "payment.duplicate_credited",
    entity: "order",
    entityId: order.id,
    after: {
      reference: ref,
      alreadyPaidUnder: order.paymentRef,
      amountUsd: invoice.amountUsd,
    },
  });

  return "second-payment-credited";
}

/**
 * A payment that cleared after the deal had stopped waiting for it.
 *
 * The buyer pays at 47h55m and the network confirms at 48h05m; by then the
 * sweep has moved the order to PAYMENT_EXPIRED, which is terminal. This used
 * to throw: the webhook answered 500 for ever, the reconciliation sweep
 * re-threw on every tick, and the money was never written down anywhere —
 * no ledger row, no deposit, no refund, nothing but a log line.
 *
 * It becomes the buyer's balance instead, which is recoverable and visible.
 * Idempotent on the reference, so a retry does not credit twice.
 */
async function creditUnusablePayment(
  order: { id: string; buyerId: string; status: string },
  ref: string,
  asset: string,
  amountUsd: number,
): Promise<void> {
  try {
    await db.ledgerEntry.create({
      data: {
        userId: order.buyerId,
        orderId: order.id,
        kind: "DEPOSIT",
        amountUsd,
        note: `Paid when this deal could no longer take it; credited to your balance (${asset})`,
        externalRef: `late:${ref}`,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return;
    throw error;
  }

  await recordAudit({
    actorId: null,
    action: "payment.arrived_too_late",
    entity: "order",
    entityId: order.id,
    after: { reference: ref, status: order.status, amountUsd },
  });
}

export async function recordOpeningPayment(
  orderId: string,
  ref: string,
  asset: string,
  /** Guards the one re-entry after a lost compare-and-set. */
  attempt = 0,
): Promise<PaymentOutcome> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      mode: true,
      status: true,
      paymentRef: true,
      totalUsd: true,
      buyerFeeUsd: true,
      buyerId: true,
      reference: true,
      conversationId: true,
    },
  });

  if (!order) throw new Error(`No such order: ${orderId}`);

  // Same reference twice: the first one already did the work.
  if (order.paymentRef === ref) return "already-applied";

  // A different reference on an order that is already paid is a second
  // payment, not a retry — a buyer can open an invoice and then pay the same
  // deal from their balance, and nothing cancels the invoice. Throwing here
  // lost the money: the webhook swallowed it, and there was no deposit, no
  // refund row and no audit trail. It becomes a wallet credit instead, which
  // is both recoverable and visible.
  if (order.paymentRef) {
    return creditSecondPayment(order, ref, asset);
  }

  const target = OPENING_STATUS[order.mode];
  if (!canTransition(order.mode, order.status, target, "system")) {
    // Real money that the deal can no longer accept. It becomes balance
    // rather than an exception nobody can clear.
    await creditUnusablePayment(order, ref, asset, order.totalUsd);
    return "credited-to-balance";
  }

  const now = new Date();
  let claimed = true;
  await db.$transaction(async (tx) => {
    // The early return above catches a webhook replayed after the first call
    // finished. It does not catch two deliveries in flight at once, which is
    // what a retry storm actually looks like: both would read a null
    // paymentRef and both would write a ledger row, and the books would claim
    // twice the money held. Claiming the null paymentRef inside the
    // transaction is what makes the second one a no-op.
    const took = await tx.order.updateMany({
      // The status belongs in the predicate as well as the reference. The
      // transition was decided above, outside the transaction, and the
      // expiry sweep can commit between the two: its own CAS keys on the
      // status, and without the same key here a terminal order was quietly
      // resurrected — with the listing already back on the market.
      where: { id: order.id, paymentRef: null, status: order.status },
      data: {
        status: target,
        paymentRef: ref,
        paymentAsset: asset,
        paidAt: now,
        feePaidAt: now,
      },
    });
    if (took.count !== 1) {
      claimed = false;
      return;
    }

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
        // Held, in both modes: price and fee on Fastest, the fee on Safest.
        // None of it is ours until it is earned — at completion, or for a
        // Safest fee when a deal fails after custody — so a refund before
        // then is held money going home, not revenue given back.
        kind: "ESCROW_HOLD",
        amountUsd: order.totalUsd,
        note: `${order.mode} opening payment`,
      },
    });

    // Nobody pressed a button for this: the processor said so. No sender.
    if (order.conversationId) {
      await postEvent(tx, {
        conversationId: order.conversationId,
        kind: "EVENT",
        event: { type: "payment-received", reference: order.reference },
        senderId: null,
        orderId: order.id,
        at: now,
      });
    }
  });

  // Lost the compare-and-set. Before `status` joined the predicate the only
  // way to miss was an identical delivery that had already done the work,
  // and returning here was right. Now the order may also have moved under
  // us — expired by the sweep, or claimed by a payment from the buyer's
  // balance — and returning would drop a payment that really arrived.
  //
  // So read it again and decide from what is actually there. One re-entry:
  // whatever the order is now, the branches above either finish or credit,
  // and a second miss means something is changing the row in a loop.
  if (!claimed) {
    if (attempt > 0) {
      await recordAudit({
        actorId: null,
        action: "payment.unsettled",
        entity: "order",
        entityId: order.id,
        after: { reference: ref, status: order.status },
      });
      throw new Error(
        `Could not settle payment ${ref} on ${order.id}: the order kept moving.`,
      );
    }
    return recordOpeningPayment(orderId, ref, asset, attempt + 1);
  }

  await notifyNextActor(order.id);

  // No actor: the platform did this on its own, on a cleared payment.
  await recordAudit({
    actorId: null,
    action: "deal.fee_paid",
    entity: "order",
    entityId: order.id,
    before: { status: order.status },
    after: {
      status: target,
      paymentRef: ref,
      asset,
      amountUsd: order.totalUsd,
    },
  });

  return "applied";
}

/** Safest's price step: the step the price payment completes. */
function safestPriceStep(): number {
  const position = priceStepFor("SAFEST");
  if (position === null)
    throw new Error("The Safest template has no price step.");
  return position;
}

/**
 * The Safest price reaching Channel Adda.
 *
 * The second payment on a Safest deal, made after our agent holds the channel
 * and the buyer has inspected it — by invoice, or recorded by finance when it
 * arrived some other way (a payment from the balance is `payFromWallet`). It
 * goes to us, never to the seller: it is held, and released to the seller's
 * Channel Adda wallet when Hold 2 completes.
 *
 * It mirrors `recordOpeningPayment` case for case — the same reference twice
 * is a retry, a second reference is a second payment and becomes the buyer's
 * balance, a deal that can no longer take it credits it back — but keyed on
 * its own reference, so the two payments on one deal can never be mistaken
 * for each other.
 */
export async function recordPricePayment(
  orderId: string,
  ref: string,
  asset: string,
  /** Guards the one re-entry after a lost compare-and-set. */
  attempt = 0,
): Promise<PaymentOutcome> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      mode: true,
      status: true,
      buyerPaymentRef: true,
      priceUsd: true,
      totalUsd: true,
      buyerId: true,
      reference: true,
      conversationId: true,
    },
  });
  if (!order) throw new Error(`No such order: ${orderId}`);

  if (order.buyerPaymentRef === ref) return "already-applied";

  if (order.buyerPaymentRef) {
    return creditSecondPayment(
      { ...order, paymentRef: order.buyerPaymentRef },
      ref,
      asset,
    );
  }

  // Only a Safest deal waiting on its price can take one. Anything else —
  // a deal returned, cancelled or paused in a dispute meanwhile — means real
  // money the deal cannot use, which becomes the buyer's balance.
  if (
    order.mode !== "SAFEST" ||
    order.status !== "AWAITING_BUYER_PAYMENT" ||
    !canTransition(order.mode, order.status, "AWAITING_HANDOVER", "system")
  ) {
    await creditUnusablePayment(order, ref, asset, order.priceUsd);
    return "credited-to-balance";
  }

  const now = new Date();
  let claimed = true;
  await db.$transaction(async (tx) => {
    // Compare-and-set on the reference and the status, as the opening
    // payment does: two deliveries in flight, or the balance and an invoice
    // landing together, must not both write a hold.
    const took = await tx.order.updateMany({
      where: {
        id: order.id,
        buyerPaymentRef: null,
        status: "AWAITING_BUYER_PAYMENT",
      },
      data: {
        status: "AWAITING_HANDOVER",
        buyerPaymentRef: ref,
        buyerPaidAt: now,
      },
    });
    if (took.count !== 1) {
      claimed = false;
      return;
    }

    await tx.transferStep.updateMany({
      where: {
        orderId: order.id,
        position: safestPriceStep(),
        completedAt: null,
      },
      data: { completedAt: now },
    });

    await tx.ledgerEntry.create({
      data: {
        orderId: order.id,
        userId: null,
        kind: "ESCROW_HOLD",
        amountUsd: order.priceUsd,
        note: "SAFEST price payment",
      },
    });

    if (order.conversationId) {
      await postEvent(tx, {
        conversationId: order.conversationId,
        kind: "EVENT",
        event: {
          type: "price-paid",
          reference: order.reference,
          amountCents: order.priceUsd,
        },
        senderId: null,
        orderId: order.id,
        at: now,
      });
    }
  });

  // Lost the race: read the order again and decide from what is there now,
  // once, exactly as the opening payment does.
  if (!claimed) {
    if (attempt > 0) {
      await recordAudit({
        actorId: null,
        action: "payment.unsettled",
        entity: "order",
        entityId: order.id,
        after: { reference: ref, status: order.status, stage: "price" },
      });
      throw new Error(
        `Could not settle price payment ${ref} on ${order.id}: the order kept moving.`,
      );
    }
    return recordPricePayment(orderId, ref, asset, attempt + 1);
  }

  await notifyNextActor(order.id);

  await recordAudit({
    actorId: null,
    action: "deal.price_paid",
    entity: "order",
    entityId: order.id,
    before: { status: order.status },
    after: {
      status: "AWAITING_HANDOVER",
      reference: ref,
      asset,
      amountUsd: order.priceUsd,
    },
  });

  return "applied";
}

/**
 * Finance recording a Safest price that reached us outside Cryptomus.
 *
 * Named by the deal's own reference with a `:price` suffix, for the reason
 * `recordManualPayment` gives: a typed txid as the payment's name made a
 * second name for the same money. The suffix keeps it apart from the
 * opening payment, which is named by the bare reference.
 */
export async function recordManualPricePayment(
  orderId: string,
  txid: string,
  asset: string,
): Promise<PaymentOutcome> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { reference: true },
  });
  if (!order) throw new Error(`No such order: ${orderId}`);

  if (await checkoutInPlay(orderId, "DEAL_PRICE")) {
    await recordAudit({
      actorId: null,
      action: "payment.manual_refused",
      entity: "order",
      entityId: orderId,
      after: { txid, asset, reason: "invoice-open", stage: "price" },
    });
    return "invoice-open";
  }

  await recordAudit({
    actorId: null,
    action: "payment.recorded_by_hand",
    entity: "order",
    entityId: orderId,
    after: { txid, asset, reference: order.reference, stage: "price" },
  });

  return recordPricePayment(orderId, `${order.reference}:price`, asset);
}

/** The staff desks. `AGENT` is deliberately absent — see `roleOnDeal`. */
const STAFF_ROLES: readonly UserRole[] = ["MODERATOR", "FINANCE", "SUPERADMIN"];

type DealParties = {
  buyerId: string;
  sellerId: string;
  agentId: string | null;
};

/**
 * Which part the caller plays **in this deal**.
 *
 * Worked out from the order, never taken from the caller. Holding the AGENT
 * role is not enough: an agent who is not assigned to this order is no more
 * entitled to advance it than a stranger, which is the same reason a seller
 * cannot act on another seller's deal.
 */
async function roleOnDeal(
  parties: DealParties,
  userId: string,
): Promise<DealActor | null> {
  if (userId === parties.buyerId) return "buyer";
  if (userId === parties.sellerId) return "seller";

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, bannedAt: true },
  });
  if (!user) return null;

  // The order records who was given the channel; it counts only while they
  // still hold the role. Moving an agent to another role was meant to take
  // their desk away, and the deal kept answering "agent" for them, so they
  // could sign back in and hand the channel over anyway. Their deals wait
  // for reassignment instead (listDealsNeedingReassignment).
  if (
    parties.agentId &&
    userId === parties.agentId &&
    user.role === "AGENT" &&
    !user.bannedAt
  ) {
    return "agent";
  }
  return STAFF_ROLES.includes(user.role) ? "staff" : null;
}

/** Which `Order` timestamp a completed step stamps, if any. */
const STEP_TIMESTAMP: Partial<
  Record<DealMode, Record<number, "custodyAt" | "handoverAt">>
> = {
  // buyerPaidAt is the price arriving, which recordPricePayment stamps.
  SAFEST: {
    4: "custodyAt",
    8: "handoverAt",
  },
  FASTEST: { 5: "handoverAt" },
};

/**
 * How many channels this agent is holding right now.
 *
 * Only Safest counts. A Fastest agent supervises as a manager and never takes
 * ownership, so they tie up nothing that has to be given back.
 */
export async function holdsFor(agentId: string): Promise<number> {
  return db.order.count({
    where: {
      agentId,
      mode: "SAFEST",
      // A dispute does not hand the channel back. DISPUTED is not in
      // AGENT_HOLDS and a buyer may dispute for free, so leaving it out let
      // an agent at their cap take as many channels again as they had
      // disputes — while still owning the first lot.
      OR: [
        { status: { in: [...AGENT_HOLD_STATUSES] } },
        { status: "DISPUTED", custodyAt: { not: null } },
      ],
    },
  });
}

/** The same list the transition table uses, so the two cannot drift. */
const AGENT_HOLD_STATUSES = AGENT_HOLDS;

/**
 * Put an agent on a deal.
 *
 * The cap exists because a Safest agent genuinely owns other people's
 * channels: Google limits how many channels one account may own, and an agent
 * account that gets locked or phished freezes every deal it is holding.
 */
export async function assignAgent(input: {
  orderId: string;
  agentId: string;
  agentEmail: string;
  agentBrand: string;
  byUserId: string;
}): Promise<DealOutcome> {
  const order = await db.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      mode: true,
      status: true,
      buyerId: true,
      sellerId: true,
      agentId: true,
      conversationId: true,
    },
  });

  if (!order) return { ok: false, reason: "not-found" };
  if (isTerminal(order.status)) return { ok: false, reason: "terminal" };

  const assignee = await db.user.findUnique({
    where: { id: input.agentId },
    select: { role: true, bannedAt: true, name: true },
  });
  if (assignee?.role !== "AGENT" || assignee.bannedAt) {
    return { ok: false, reason: "wrong-actor" };
  }

  // Staff may place anyone. An agent may take an unclaimed deal for
  // themselves and nothing else — the queue has to work without a moderator
  // handing out every job, but an agent must not be able to take a channel
  // off a colleague or nominate who holds one. Being the buyer or the seller
  // is never enough: a seller could otherwise pick their own custodian.
  const actor = await roleOnDeal(order, input.byUserId);
  // `actor` is null for someone with no part in this deal, which is exactly
  // who an unassigned agent is. A buyer or seller who also holds the AGENT
  // role resolves to “buyer” or “seller” here, and the check used not to
  // look — so a seller with the role became the custodian of their own sale.
  const claimingUnheld =
    actor === null &&
    order.agentId === null &&
    input.byUserId === input.agentId;
  if (actor !== "staff" && !claimingUnheld) {
    return { ok: false, reason: "wrong-actor" };
  }

  const settings = await getSettings();

  try {
    await db.$transaction(
      async (tx) => {
        // Counting and writing in one serialisable transaction: two staff
        // assigning the same agent at once must not both read "one under the
        // cap" and both write.
        const held = await tx.order.count({
          where: {
            agentId: input.agentId,
            mode: "SAFEST",
            // Same rule as countHeld: a disputed channel is still held.
            OR: [
              { status: { in: [...AGENT_HOLD_STATUSES] } },
              { status: "DISPUTED", custodyAt: { not: null } },
            ],
            // Reassigning this very order is not a new channel to hold.
            id: { not: order.id },
          },
        });
        if (order.mode === "SAFEST" && held >= settings.maxHoldsPerAgent) {
          throw new DealAbort("cap-reached");
        }

        await tx.order.update({
          where: { id: order.id },
          data: {
            agentId: input.agentId,
            agentEmail: input.agentEmail,
            agentBrand: input.agentBrand,
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (error instanceof DealAbort) return { ok: false, reason: error.reason };
    // A serialisation failure means the other transaction won the race, which
    // for this purpose is the same answer as being over the cap.
    if (isSerializationFailure(error)) {
      return { ok: false, reason: "cap-reached" };
    }
    throw error;
  }

  // After the commit, not inside it. The transaction above is Serializable
  // and reports any serialisation failure as "over the cap", so a chat line
  // written in it — which touches the conversation every message touches —
  // would make a message landing at the same moment read as the agent being
  // full. A crash between the two loses this line, not the assignment.
  if (order.conversationId && order.agentId !== input.agentId) {
    await postEvent(db, {
      conversationId: order.conversationId,
      kind: "EVENT",
      event: {
        // A seller who already invited the previous agent's address has to
        // be told plainly that it changed.
        type: order.agentId ? "agent-changed" : "agent-joined",
        agentName: assignee.name,
      },
      senderId: null,
      orderId: order.id,
    });
  }

  await notifyNextActor(order.id);

  await recordAudit({
    actorId: input.byUserId,
    action: "deal.agent_assigned",
    entity: "order",
    entityId: order.id,
    before: { agentId: order.agentId },
    after: { agentId: input.agentId, agentEmail: input.agentEmail },
  });

  return { ok: true };
}

export async function advanceStep(input: {
  orderId: string;
  position: number;
  userId: string;
  proofUrl?: string;
  approvedById?: string;
}): Promise<DealOutcome> {
  const order = await db.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      mode: true,
      status: true,
      listingId: true,
      buyerId: true,
      sellerId: true,
      agentId: true,
      priceUsd: true,
      sellerFeeUsd: true,
      buyerFeeUsd: true,
      totalUsd: true,
      paymentRef: true,
      buyerPaidAt: true,
      holdUntil: true,
      conversationId: true,
      listing: { select: { platform: true } },
      steps: {
        where: { completedAt: null },
        orderBy: { position: "asc" },
        take: 1,
        select: { position: true },
      },
    },
  });

  if (!order) return { ok: false, reason: "not-found" };
  if (isTerminal(order.status)) return { ok: false, reason: "terminal" };

  // Nothing moves before the money arrives. The whole protection rests on
  // this: the opening payment is what buys the seller the confidence to hand
  // a channel to our agent. Step 1 is completed by `recordOpeningPayment` and
  // by nothing else, so a buyer cannot mark their own payment done and walk
  // somebody else's channel into custody having paid nothing.
  if (order.status === "AWAITING_PAYMENT") {
    return { ok: false, reason: "not-paid" };
  }

  // A dispute freezes the deal. Without this, steps that carry no status
  // change still advanced — a seller could promote the buyer to owner during
  // a dispute and then watch the only reachable outcome refund them.
  if (order.status === "DISPUTED") {
    return { ok: false, reason: "disputed" };
  }

  if (input.proofUrl !== undefined && !isSafeProofUrl(input.proofUrl)) {
    return { ok: false, reason: "bad-proof" };
  }

  const actor = await roleOnDeal(order, input.userId);
  if (!actor) return { ok: false, reason: "wrong-actor" };

  // Only the lowest incomplete step is available. Nothing is skipped and
  // nothing is redone.
  const next = order.steps[0]?.position;
  if (next !== input.position) return { ok: false, reason: "wrong-step" };

  const template = templateFor(order.mode).find(
    (s) => s.position === input.position,
  );
  if (!template) return { ok: false, reason: "wrong-step" };
  // The Safest price is the buyer paying us, recorded when the money
  // arrives. Letting anyone mark it done would let a deal move on unpaid.
  if (template.byPayment) return { ok: false, reason: "pay-in-checkout" };
  if (template.actor !== actor) return { ok: false, reason: "wrong-actor" };

  if (
    template.entersStatus &&
    !canTransition(order.mode, order.status, template.entersStatus, actor)
  ) {
    return { ok: false, reason: "wrong-step" };
  }

  // The step that hands value across needs a second pair of eyes above the
  // platform's threshold, so one compromised agent account cannot misdirect a
  // channel or a payout on its own.
  let approver: string | null = null;
  if (template.needsApprovalAbove) {
    const settings = await getSettings();
    if (order.priceUsd >= settings.secondApprovalAboveUsd) {
      approver = await validApprover(input.approvedById, input.userId);
      if (!approver) return { ok: false, reason: "needs-approval" };
    }
  }

  const now = new Date();
  const stamp = STEP_TIMESTAMP[order.mode]?.[input.position];
  const completing = template.entersStatus === "COMPLETED";

  // Every listing page promises a recovery hold: the seller's money is not
  // released until the window in which an old owner can reclaim the account
  // has passed. Nothing implemented it — Order.holdUntil was written by
  // nothing — so a Fastest seller was credited the minute the buyer
  // confirmed, and a recovery on day six left the buyer with neither.
  if (
    completing &&
    order.mode === "FASTEST" &&
    order.holdUntil &&
    order.holdUntil > now
  ) {
    return { ok: false, reason: "on-hold" };
  }
  const startsHold = order.mode === "FASTEST" && stamp === "handoverAt";
  const holdDays =
    platformMap[
      order.listing.platform.toLowerCase() as keyof typeof platformMap
    ]?.holdDays ?? 14;
  const holdUntil = new Date(now.getTime() + holdDays * 86_400_000);
  const doer = await db.user.findUnique({
    where: { id: input.userId },
    select: { name: true },
  });

  try {
    await db.$transaction(async (tx) => {
      // Compare-and-set, not update: two overlapping clicks on the same step
      // would otherwise both pass the read above and both run the completion
      // block, crediting the seller twice. `createDeal` has guarded its race
      // since the start; these two writes are the ones that move money.
      const claimed = await tx.transferStep.updateMany({
        where: {
          orderId: order.id,
          position: input.position,
          completedAt: null,
        },
        data: {
          completedAt: now,
          proofUrl: input.proofUrl ?? undefined,
          approvedById: approver ?? undefined,
        },
      });
      if (claimed.count !== 1) throw new DealAbort("wrong-step");

      // Dispute evidence. Without the stamp the orphan sweep collects it an
      // hour later, because it only knows about listing proofs, messages
      // and listing artwork.
      if (input.proofUrl) await markUploadsAttached([input.proofUrl]);

      const moved = await tx.order.updateMany({
        where: { id: order.id, status: order.status },
        data: {
          ...(template.entersStatus ? { status: template.entersStatus } : {}),
          ...(stamp ? { [stamp]: now } : {}),
          ...(startsHold ? { holdUntil } : {}),
          ...(completing ? { completedAt: now } : {}),
        },
      });
      if (moved.count !== 1) throw new DealAbort("wrong-step");

      if (completing) await completeOrder(tx, order);

      // The record, in the conversation: the step, by whoever did it, and
      // what it set going. The transaction reference a Safest buyer typed is
      // not repeated here — it is on the deal, and this line is a preview.
      //
      // A millisecond apart, so the lines keep the order they happened in:
      // the thread is sorted by time, and equal times have no order.
      if (order.conversationId) {
        const line = (offset: number) => ({
          conversationId: order.conversationId as string,
          kind: "EVENT" as const,
          orderId: order.id,
          at: new Date(now.getTime() + offset),
        });
        await postEvent(tx, {
          ...line(0),
          event: {
            type: "step-done",
            name: doer?.name ?? "",
            label: template.label,
          },
          senderId: input.userId,
        });
        if (startsHold) {
          await postEvent(tx, {
            ...line(1),
            event: { type: "hold-started", until: holdUntil },
            senderId: null,
          });
        }
        if (completing) {
          await postEvent(tx, {
            ...line(2),
            event: { type: "deal-ended", outcome: RESOLUTION_LABELS.COMPLETED },
            senderId: null,
          });
        }
      }
    });
  } catch (error) {
    if (error instanceof DealAbort) return { ok: false, reason: error.reason };
    throw error;
  }

  await notifyNextActor(order.id);
  // The last step leaves no next actor, so nobody heard that the deal they
  // were in had finished. Everyone on it does now.
  if (completing) {
    await notifyDealEnded(order.id, RESOLUTION_LABELS.COMPLETED);
  }

  await recordAudit({
    actorId: input.userId,
    action: completing ? "deal.completed" : "deal.step_completed",
    entity: "order",
    entityId: order.id,
    before: { status: order.status },
    after: {
      position: input.position,
      label: template.label,
      status: template.entersStatus ?? order.status,
      ...(approver ? { approvedById: approver } : {}),
    },
  });

  return { ok: true };
}

/**
 * The ways a deal ends other than by completing.
 *
 * This exists so those four statuses are reachable at all. Without it
 * `CANCELLED`, `RETURNED_TO_SELLER`, `REFUNDED` and `DISPUTED` would be
 * values no code could ever write.
 */
/** One audit action per terminal, so the feed reads as what happened. */
const RESOLUTION_ACTIONS = {
  CANCELLED: "deal.cancelled",
  RETURNED_TO_SELLER: "deal.returned",
  REFUNDED: "deal.refunded",
  DISPUTED: "deal.disputed",
  COMPLETED: "deal.completed",
} as const;

/** What both sides are told the outcome was. */
const RESOLUTION_LABELS = {
  CANCELLED: "Deal cancelled",
  RETURNED_TO_SELLER: "Channel returned to the seller",
  REFUNDED: "Buyer refunded",
  DISPUTED: "Dispute raised",
  COMPLETED: "Deal completed",
} as const;

type CompletableOrder = {
  id: string;
  mode: DealMode;
  listingId: string;
  sellerId: string;
  priceUsd: number;
  sellerFeeUsd: number;
  buyerFeeUsd: number;
  totalUsd: number;
  paymentRef: string | null;
  buyerPaidAt: Date | null;
};

/**
 * Finishing a deal: the listing is sold and the money moves.
 *
 * Shared by the last step of the happy path and by staff resolving a dispute
 * in the buyer's favour, so the two cannot drift apart in what they pay out.
 *
 * The platform's hold is released in full and its fee re-recorded, rather than
 * the fee simply being added on top. Adding it left the platform's own
 * position claiming to hold the price it had just paid away, plus the fee
 * twice — invisible while nothing read those rows, and about to be wrong in
 * the wallet phase that does.
 */
async function completeOrder(tx: Tx, order: CompletableOrder) {
  // Everything paid in is released at once, so it has to be exactly what the
  // deal says was paid in. A deal whose books disagree stops here rather than
  // crediting a seller from money that never arrived.
  const held = requiredHold(order);
  if ((await platformHoldFor(tx, order.id)) !== held) {
    throw new DealAbort("books-mismatch");
  }

  await tx.listing.update({
    where: { id: order.listingId },
    data: { status: "SOLD" },
  });

  // The seller is paid from the hold only when the price is in it: always on
  // Fastest, and on Safest once the buyer has paid the price to us.
  const priceHeld = held === order.priceUsd + order.buyerFeeUsd;

  await tx.ledgerEntry.createMany({
    data: [
      {
        orderId: order.id,
        userId: null,
        kind: "ESCROW_RELEASE",
        amountUsd: -held,
        note: "Hold released",
      },
      ...(priceHeld
        ? [
            {
              orderId: order.id,
              userId: order.sellerId,
              kind: "ESCROW_RELEASE" as const,
              amountUsd: order.priceUsd,
              note: "Sale released to seller",
            },
          ]
        : []),
      {
        orderId: order.id,
        userId: null,
        kind: "BUYER_FEE",
        amountUsd: order.buyerFeeUsd,
        note: "Buyer fee",
      },
      // Debited from the seller and credited to the platform. Only one half
      // was written before, so the moment the rate stopped being zero the
      // seller fee vanished from the books and the platform's position no
      // longer netted to what it had actually kept.
      ...(priceHeld && order.sellerFeeUsd > 0
        ? [
            {
              orderId: order.id,
              userId: order.sellerId,
              kind: "SELLER_FEE" as const,
              amountUsd: -order.sellerFeeUsd,
              note: "Seller fee",
            },
            {
              orderId: order.id,
              userId: null,
              kind: "SELLER_FEE" as const,
              amountUsd: order.sellerFeeUsd,
              note: "Seller fee",
            },
          ]
        : []),
    ],
  });
}

/**
 * Deals abandoned before the buyer ever paid.
 *
 * Creating a deal reserves the listing, so without this an abandoned deal
 * holds a listing off the market for good — and anyone could do it, for free,
 * to every listing on the site. Evaluated when something looks rather than on
 * a timer, the way stale offers already are in `@/server/offers`; the
 * scheduler that would do it properly is a later phase.
 */
// The window itself is PlatformSettings.paymentWindowHours, set by an admin.

/** The same sweep, narrowed to one listing someone is trying to buy. */
export async function expireStaleDealsForListing(
  listingId: string,
): Promise<number> {
  return expireStale({ listingId });
}

export async function expireStaleDeals(): Promise<number> {
  return expireStale({});
}

async function expireStale(scope: { listingId?: string }): Promise<number> {
  const { paymentWindowHours } = await getSettings();
  const cutoff = new Date(Date.now() - paymentWindowHours * 60 * 60 * 1000);
  const stale = await db.order.findMany({
    where: {
      // A dispute raised before anyone paid belongs here too. Opening a
      // deal is free and either party may dispute one, so a listing could
      // be taken off the market for ever with two calls and no money: the
      // sweep looked only at orders still awaiting payment, and nothing
      // else freed the reservation.
      status: { in: ["AWAITING_PAYMENT", "DISPUTED"] },
      paymentRef: null,
      createdAt: { lt: cutoff },
      ...(scope.listingId ? { listingId: scope.listingId } : {}),
    },
    select: {
      id: true,
      listingId: true,
      status: true,
      reference: true,
      conversationId: true,
    },
  });

  let expired = 0;
  for (const order of stale) {
    const now = new Date();
    const moved = await db.$transaction(async (tx) => {
      const took = await tx.order.updateMany({
        where: { id: order.id, status: order.status, paymentRef: null },
        data: { status: "PAYMENT_EXPIRED", cancelledAt: now },
      });
      if (took.count !== 1) return false;
      if (order.conversationId) {
        await postEvent(tx, {
          conversationId: order.conversationId,
          kind: "EVENT",
          event: { type: "payment-lapsed", reference: order.reference },
          senderId: null,
          orderId: order.id,
          at: now,
        });
      }
      return true;
    });
    if (!moved) continue;

    await db.listing.updateMany({
      where: { id: order.listingId, status: "RESERVED" },
      data: { status: "LIVE" },
    });
    // Both sides were left to find out by looking; the listing is back on
    // sale and the buyer can start again.
    await notifyDealEnded(order.id, "Payment window closed");
    await recordAudit({
      actorId: null,
      action: "deal.expired",
      entity: "order",
      entityId: order.id,
      before: { status: order.status },
      after: { status: "PAYMENT_EXPIRED" },
    });
    expired += 1;
  }

  return expired;
}

/**
 * Whether an outcome pays somebody out of the platform's position.
 *
 * `COMPLETED` releases the hold and `REFUNDED` returns it. `CANCELLED` and
 * `RETURNED_TO_SELLER` on a paid deal hand back whatever is still held — on
 * Safest that can be the whole price once the buyer has paid it to us — so
 * they are refunds under other names, and leaving them off made the finance
 * gate one radio button wide. `DISPUTED` moves nothing.
 */
function movesPlatformMoney(
  to: string,
  order: { mode: string; paymentRef: string | null },
): boolean {
  if (to === "COMPLETED" || to === "REFUNDED") return true;
  // Both now hand back held money, in either mode, once anything was paid.
  if (to === "CANCELLED" || to === "RETURNED_TO_SELLER") {
    return order.paymentRef !== null;
  }
  return false;
}

export async function resolveDeal(input: {
  orderId: string;
  to:
    | "CANCELLED"
    | "RETURNED_TO_SELLER"
    | "REFUNDED"
    | "DISPUTED"
    | "COMPLETED";
  byUserId: string;
  note: string;
}): Promise<DealOutcome> {
  const order = await db.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      mode: true,
      status: true,
      listingId: true,
      buyerId: true,
      sellerId: true,
      agentId: true,
      totalUsd: true,
      priceUsd: true,
      buyerFeeUsd: true,
      sellerFeeUsd: true,
      paymentRef: true,
      buyerPaymentRef: true,
      custodyAt: true,
      buyerPaidAt: true,
      handoverAt: true,
      reference: true,
      conversationId: true,
    },
  });

  if (!order) return { ok: false, reason: "not-found" };
  if (isTerminal(order.status)) return { ok: false, reason: "terminal" };

  const actor = await roleOnDeal(order, input.byUserId);
  if (!actor) return { ok: false, reason: "wrong-actor" };
  if (!canTransition(order.mode, order.status, input.to, actor)) {
    return { ok: false, reason: "wrong-actor" };
  }

  // There is nothing to give back if nothing was ever taken, and nothing to
  // pay out either. Both are reachable because a dispute may be raised before
  // payment and the dispute outcomes are not restricted to states where the
  // platform holds funds — so completing an unpaid Fastest deal used to
  // credit the seller the full price against a hold that never existed.
  if (
    (input.to === "REFUNDED" || input.to === "COMPLETED") &&
    !order.paymentRef
  ) {
    return { ok: false, reason: "not-paid" };
  }

  // Finishing a deal is the final step's job. That step checks the template,
  // the actor, and — above the threshold — a second staff member; none of
  // which happens here. The same transitions are legal for an agent, so
  // without this one call closed a live deal as a success with the channel
  // still in the agent's hands and the dual control walked around.
  //
  // Deciding a dispute is what this path is for, and that is left intact.
  if (input.to === "COMPLETED" && order.status !== "DISPUTED") {
    return { ok: false, reason: "not-disputed" };
  }

  // Cancelling a Safest deal whose channel we are holding closed the order,
  // put the listing back on sale, and left a staff agent personally owning
  // the seller's Google channel with RETURNED_TO_SELLER no longer
  // reachable. The seller's asset sat in a staff account while the same
  // channel was advertised again.
  //
  // There is a correct ending for this and it is the one next to it.
  if (input.to === "CANCELLED" && order.custodyAt) {
    return { ok: false, reason: "in-custody" };
  }

  // Everything below is a decision rather than a rule.
  //
  // Both of these reverse something that has already happened. Returning a
  // Safest channel once `buyerPaidAt` is set undoes a purchase the buyer
  // has paid us for — the price is refunded, but the buyer loses a channel
  // they were owed. A Fastest refund once `handoverAt` is set, or the
  // seller has handed over, reverses the buyer's own word that access
  // arrived. Refusing either outright made the guard a dead end: a refund
  // became unreachable in the only state a Fastest refund exists for, and a
  // failed Google transfer would have left the buyer's price with us for
  // ever.
  //
  // So they are not refused, they are routed: through a dispute, where a
  // moderator sees what each side claims and the decision is on the record.
  // What a single staff member must not be able to do is reverse either one
  // with one click from a running deal.
  // On a Fastest deal the seller's handover is the other claim a refund
  // reverses. It stamps nothing on the order, so it is read from the step.
  const handsOverStep = templateFor(order.mode).find((s) => s.handsOver);
  const sellerHandedOver =
    input.to === "REFUNDED" && handsOverStep
      ? (await db.transferStep.count({
          where: {
            orderId: order.id,
            position: handsOverStep.position,
            completedAt: { not: null },
          },
        })) > 0
      : false;

  const reversingSomethingClaimed =
    (input.to === "RETURNED_TO_SELLER" && order.buyerPaidAt !== null) ||
    (input.to === "REFUNDED" &&
      (order.handoverAt !== null || sellerHandedOver));
  if (reversingSomethingClaimed && order.status !== "DISPUTED") {
    return { ok: false, reason: "needs-dispute" };
  }
  // Paying somebody out of the platform's own position is the finance
  // desk's, not every moderator's.
  //
  // The product draws this line everywhere else: /admin/payouts is
  // FINANCE-only, the staff nav hides the whole Money group from
  // moderators, and the overview will not show them a payout figure. The
  // deal desk walked around all of it, because roleOnDeal collapses every
  // staff role into one “staff” actor — so a moderator could raise a
  // dispute on a $50,000 deal and decide it in the seller's favour, and the
  // whole escrow landed in a wallet with no finance involvement at all.
  //
  // Everything that moves no platform money is still theirs to decide.
  if (movesPlatformMoney(input.to, order)) {
    const decider = await db.user.findUnique({
      where: { id: input.byUserId },
      select: { role: true },
    });
    if (
      !decider ||
      (decider.role !== "FINANCE" && decider.role !== "SUPERADMIN")
    ) {
      return { ok: false, reason: "needs-finance" };
    }
  }

  const now = new Date();
  const by = await db.user.findUnique({
    where: { id: input.byUserId },
    select: { name: true },
  });
  try {
    await db.$transaction(async (tx) => {
      const moved = await tx.order.updateMany({
        where: { id: order.id, status: order.status },
        data: {
          status: input.to,
          ...(input.to === "DISPUTED"
            ? {}
            : input.to === "COMPLETED"
              ? { completedAt: now }
              : { cancelledAt: now }),
        },
      });
      if (moved.count !== 1) throw new DealAbort("terminal");

      // The record, in the conversation. A dispute names who raised it, as
      // the deal page does; an ending says what it was. The note behind it
      // stays on the dispute, where staff read it — it is free text, and this
      // line is shown in previews.
      if (order.conversationId) {
        await postEvent(tx, {
          conversationId: order.conversationId,
          kind: "EVENT",
          event:
            input.to === "DISPUTED"
              ? {
                  type: "dispute-raised",
                  // Staff raise a dispute as Channel Adda, never by name.
                  name: actor === "staff" ? "Channel Adda" : (by?.name ?? ""),
                }
              : { type: "deal-ended", outcome: RESOLUTION_LABELS[input.to] },
          // Staff act as Channel Adda, never as a named person — the same rule
          // as their messages — so a staff decision carries no sender.
          senderId: actor === "staff" ? null : input.byUserId,
          orderId: order.id,
          at: now,
        });
      }

      // A dispute is a pause: the listing stays reserved because the deal may
      // still complete.
      if (input.to === "DISPUTED") return;

      // Staff deciding a dispute in the buyer's favour finishes the deal, and
      // has to pay out exactly as the happy path would.
      if (input.to === "COMPLETED") {
        await completeOrder(tx, order);
        return;
      }

      await tx.listing.updateMany({
        where: { id: order.listingId, status: "RESERVED" },
        data: { status: "LIVE" },
      });

      // A refund is credited to the buyer's Channel Adda balance, whatever
      // they paid with.
      //
      // It used to do this only for a deal paid out of a balance, on the
      // reasoning that a crypto payment goes back the way it came. Nothing
      // sends it back: there is no outbound refund anywhere in this
      // codebase, and the processor's own refund statuses are inbound
      // notifications about something a human did elsewhere. So the
      // platform wrote itself a debit, its position netted to zero, and the
      // buyer got a deal marked REFUNDED and no money at all.
      //
      // The balance is the mechanism that exists, and it is withdrawable to
      // the buyer's own wallet through the payout queue.

      const refund = async (amountUsd: number, note: string) => {
        await tx.ledgerEntry.create({
          data: {
            orderId: order.id,
            userId: null,
            kind: "REFUND",
            amountUsd: -amountUsd,
            note,
          },
        });
        await tx.ledgerEntry.create({
          data: {
            orderId: order.id,
            userId: order.buyerId,
            kind: "REFUND",
            amountUsd,
            note,
          },
        });
      };

      // What is handed back is whatever is still held, less a Safest fee the
      // agent has already earned by taking custody. The hold is checked
      // against what the deal says was paid in first, so a refund can never
      // hand back money the platform does not have.
      const held = await platformHoldFor(tx, order.id);
      if (held !== requiredHold(order)) throw new DealAbort("books-mismatch");

      // Money the processor has already sent back to the payer left our
      // account without passing through the ledger. It comes off the hold
      // with nobody credited: crediting the buyer's balance as well paid
      // them back twice.
      const gone = Math.min(held, await refundedByProcessor(tx, order));
      if (gone > 0) {
        await tx.ledgerEntry.create({
          data: {
            orderId: order.id,
            userId: null,
            kind: "REFUND",
            amountUsd: -gone,
            note: "Refunded by the processor",
          },
        });
      }
      const remaining = held - gone;

      if (input.to === "REFUNDED") {
        // Returns the whole hold, so the platform's own position nets to zero.
        if (remaining > 0) await refund(remaining, input.note);
        return;
      }
      const kept = Math.min(keptFee(order), remaining);

      // A cancellation or a return hands back whatever is still held.
      //
      // This once refunded `buyerFeeUsd` whenever `!order.custodyAt` — and
      // custodyAt is stamped on Safest step 4 and nowhere else, so on every
      // paid *Fastest* deal the condition held and the refund was the admin
      // fee. The platform kept the channel price, the order went terminal,
      // and since the only REFUND writes in this codebase are the two above,
      // no path remained that could ever return it. A $100 deal cancelled
      // after payment left $100 of the buyer's money on our books for good.
      //
      // On Fastest all of it goes back: a deal that did not happen does not
      // earn a fee. On Safest, once an agent has taken custody the fee is the
      // work they did — which /fees states — so it is kept and booked as
      // earned, and only the rest goes back. An unpaid deal holds nothing, so
      // nothing is refunded and the platform's position cannot go negative.
      if (remaining - kept > 0) {
        await refund(remaining - kept, `Refunded: ${input.note}`);
      }
      if (kept > 0) {
        // Earned, so it leaves the hold and becomes the platform's.
        await tx.ledgerEntry.createMany({
          data: [
            {
              orderId: order.id,
              userId: null,
              kind: "ESCROW_RELEASE",
              amountUsd: -kept,
              note: "Fee earned: the agent took custody",
            },
            {
              orderId: order.id,
              userId: null,
              kind: "BUYER_FEE",
              amountUsd: kept,
              note: "Buyer fee",
            },
          ],
        });
      }
    });
  } catch (error) {
    if (error instanceof DealAbort) return { ok: false, reason: error.reason };
    throw error;
  }

  if (input.to === "DISPUTED") {
    await notifyDealEnded(order.id, "Dispute raised");
    // The people who decide it. A disputed deal used to be a red row in a
    // list that somebody had to happen to look at.
    await notifyStaff(["MODERATOR"], (staffId) => ({
      userId: staffId,
      kind: "DISPUTE",
      title: `Dispute raised on ${order.reference}`,
      body: input.note.slice(0, 200),
      href: "/admin/disputes",
    }));
  } else {
    await notifyDealEnded(order.id, RESOLUTION_LABELS[input.to]);
  }

  await recordAudit({
    actorId: input.byUserId,
    action: RESOLUTION_ACTIONS[input.to],
    entity: "order",
    entityId: order.id,
    before: { status: order.status },
    after: { status: input.to, note: input.note },
  });

  return { ok: true };
}

export type DealListRow = {
  id: string;
  reference: string;
  mode: DealMode;
  status: OrderStatus;
  priceUsd: number;
  totalUsd: number;
  listingTitle: string;
  otherSideName: string;
  side: "buyer" | "seller" | "agent";
  /** Whose move it is, or null once the deal has stopped. */
  awaiting: DealActor | null;
  createdAt: Date;
};

/**
 * Every deal this person is part of, on any side.
 *
 * One list rather than a buyer tab and a seller tab, because everyone here
 * buys and sells and a mode switch would hide half of what they are doing.
 */
export async function listDealsFor(userId: string): Promise<DealListRow[]> {
  const orders = await db.order.findMany({
    where: {
      OR: [{ buyerId: userId }, { sellerId: userId }, { agentId: userId }],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      reference: true,
      mode: true,
      status: true,
      priceUsd: true,
      totalUsd: true,
      buyerId: true,
      sellerId: true,
      agentId: true,
      createdAt: true,
      listing: { select: { title: true } },
      buyer: { select: { name: true } },
      seller: { select: { name: true } },
      steps: {
        where: { completedAt: null },
        orderBy: { position: "asc" },
        take: 1,
        select: { actor: true },
      },
    },
  });

  return orders.map((order) => {
    const side =
      order.buyerId === userId
        ? ("buyer" as const)
        : order.sellerId === userId
          ? ("seller" as const)
          : ("agent" as const);

    return {
      id: order.id,
      reference: order.reference,
      mode: order.mode,
      status: order.status,
      priceUsd: order.priceUsd,
      totalUsd: order.totalUsd,
      listingTitle: order.listing.title,
      otherSideName: side === "buyer" ? order.seller.name : order.buyer.name,
      side,
      awaiting: isTerminal(order.status)
        ? null
        : ((order.steps[0]?.actor as DealActor) ?? null),
      createdAt: order.createdAt,
    };
  });
}

/**
 * How many of this person's deals are waiting on them specifically.
 *
 * Only their own move counts. A badge that lights up for every deal in flight
 * would be lit permanently and stop meaning anything.
 */
export async function countDealsAwaiting(userId: string): Promise<number> {
  const rows = await listDealsFor(userId);
  return rows.filter((row) => row.awaiting === row.side).length;
}

export type DealStepView = {
  position: number;
  label: string;
  actor: DealActor;
  completedAt: Date | null;
  proofUrl: string | null;
};

export type DealView = {
  id: string;
  reference: string;
  mode: DealMode;
  status: OrderStatus;
  priceUsd: number;
  totalUsd: number;
  buyerFeeUsd: number;
  /** Deducted before a Fastest seller is credited. Always 0 on Safest. */
  sellerFeeUsd: number;
  /** What the seller ends up with. On Safest the buyer pays it directly. */
  payoutUsd: number;
  /** What the buyer recorded when they paid the seller. On Safest this is
   *  the only evidence the payment happened, so both sides can see it. */
  buyerPaymentRef: string | null;
  buyerPaidAt: Date | null;
  /** Fastest only: the seller is not released before this. */
  holdUntil: Date | null;
  listingTitle: string;
  listingSlug: string;
  buyerName: string;
  sellerName: string;
  agentName: string | null;
  agentEmail: string | null;
  agentBrand: string | null;
  viewerRole: DealActor;
  /** The conversation this deal runs in. Every deal has one now. */
  conversationId: string | null;
  steps: DealStepView[];
  /** The lowest incomplete step, or null once the deal has stopped. */
  nextStep: DealStepView | null;
};

/**
 * One deal, as the person asking is allowed to see it.
 *
 * Returns null both for a deal that does not exist and for one this person is
 * not part of, so guessing ids tells you nothing either way.
 */
export async function getDealFor(
  userId: string,
  orderId: string,
): Promise<DealView | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      reference: true,
      mode: true,
      status: true,
      priceUsd: true,
      totalUsd: true,
      buyerFeeUsd: true,
      sellerFeeUsd: true,
      buyerPaymentRef: true,
      buyerPaidAt: true,
      holdUntil: true,
      buyerId: true,
      sellerId: true,
      agentId: true,
      agentEmail: true,
      agentBrand: true,
      conversationId: true,
      listing: { select: { title: true, slug: true } },
      buyer: { select: { name: true } },
      seller: { select: { name: true } },
      agent: { select: { name: true } },
      steps: { orderBy: { position: "asc" } },
    },
  });

  if (!order) return null;

  const viewerRole = await roleOnDeal(order, userId);
  if (!viewerRole) return null;

  const steps: DealStepView[] = order.steps.map((s) => ({
    position: s.position,
    label: s.label,
    actor: s.actor as DealActor,
    completedAt: s.completedAt,
    proofUrl: s.proofUrl,
  }));

  return {
    id: order.id,
    reference: order.reference,
    mode: order.mode,
    status: order.status,
    priceUsd: order.priceUsd,
    totalUsd: order.totalUsd,
    buyerFeeUsd: order.buyerFeeUsd,
    sellerFeeUsd: order.sellerFeeUsd,
    payoutUsd: order.priceUsd - order.sellerFeeUsd,
    buyerPaymentRef: order.buyerPaymentRef,
    buyerPaidAt: order.buyerPaidAt,
    holdUntil: order.holdUntil,
    listingTitle: order.listing.title,
    listingSlug: order.listing.slug,
    buyerName: order.buyer.name,
    sellerName: order.seller.name,
    agentName: order.agent?.name ?? null,
    // The account that takes custody of channels: the seller needs it to
    // invite, the agent and staff to check it. The buyer has no use for it,
    // and this whole view reaches their browser, hidden on screen or not.
    agentEmail: viewerRole === "buyer" ? null : order.agentEmail,
    agentBrand: order.agentBrand,
    viewerRole,
    // Not for an agent whose deal is over: their access to the conversation
    // ends with it, and a link there would be a 404.
    conversationId:
      viewerRole === "agent" && isTerminal(order.status)
        ? null
        : order.conversationId,
    steps,
    nextStep: isTerminal(order.status)
      ? null
      : (steps.find((s) => s.completedAt === null) ?? null),
  };
}
