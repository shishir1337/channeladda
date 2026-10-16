import "server-only";

import type { DealMode, OrderStatus, UserRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { canTransition, type DealActor, isTerminal } from "@/lib/deal-machine";
import { OPENING_STATUS, templateFor } from "@/lib/deal-templates";
import { orderAmounts } from "@/lib/fees";
import { recordAudit } from "@/server/audit";
import { notifyDealEnded, notifyNextActor } from "@/server/deal-notify";
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
  | "needs-approval"
  /** The opening payment has not cleared, so nothing may move yet. */
  | "not-paid"
  /** Frozen while staff decide a dispute. */
  | "disputed"
  /** Too late to undo: the buyer has already paid the seller. */
  | "already-paid"
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
 * Postgres 40001 — "could not serialize access due to read/write
 * dependencies" — which a Serializable transaction raises when it loses a
 * race.
 *
 * Three shapes, because it arrives differently depending on the layer that
 * catches it: Prisma's own `P2034`, the raw SQLSTATE, and — with the pg driver
 * adapter — a `DriverAdapterError` whose cause carries
 * `kind: "TransactionWriteConflict"` and `originalCode: "40001"`. The last one
 * is what this project actually sees, and it cost a test that passed alone and
 * failed in a full suite run to find out.
 */
function isSerializationFailure(error: unknown): boolean {
  for (let e: unknown = error, depth = 0; e && depth < 5; depth++) {
    if (typeof e !== "object") break;
    const it = e as {
      code?: string;
      originalCode?: string;
      kind?: string;
      cause?: unknown;
    };
    if (
      it.code === "P2034" ||
      it.code === "40001" ||
      it.originalCode === "40001" ||
      it.kind === "TransactionWriteConflict"
    ) {
      return true;
    }
    e = it.cause;
  }
  return false;
}

/**
 * Proof links are rendered as anchors in the deal timeline, where the other
 * party clicks them inside their own authenticated session. Only this app's
 * own upload paths and plain web links are allowed, because `javascript:` and
 * `data:` in that position are script execution, not a screenshot.
 */
function isSafeProofUrl(url: string): boolean {
  if (url.startsWith("/uploads/")) return true;
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
  if (listing.status === "RESERVED") {
    const freed = await expireStaleDealsForListing(listing.id);
    if (freed > 0) {
      const again = await db.listing.findUnique({
        where: { id: listing.id },
        select: { status: true },
      });
      if (again?.status === "LIVE") listing.status = "LIVE";
    }
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

      await recordAudit({
        actorId: input.buyerId,
        action: "deal.created",
        entity: "order",
        entityId: orderId,
        after: { mode: input.mode, reference, totalUsd: amounts.totalUsd },
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
  let claimed = true;
  await db.$transaction(async (tx) => {
    // The early return above catches a webhook replayed after the first call
    // finished. It does not catch two deliveries in flight at once, which is
    // what a retry storm actually looks like: both would read a null
    // paymentRef and both would write a ledger row, and the books would claim
    // twice the money held. Claiming the null paymentRef inside the
    // transaction is what makes the second one a no-op.
    const took = await tx.order.updateMany({
      where: { id: order.id, paymentRef: null },
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
        kind: ledger.kind,
        amountUsd: ledger.amountUsd,
        note: `${order.mode} opening payment`,
      },
    });
  });

  // Lost the race to an identical delivery. The other one did the work.
  if (!claimed) return;

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
      amountUsd: ledger.amountUsd,
    },
  });
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
  if (parties.agentId && userId === parties.agentId) return "agent";

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user && STAFF_ROLES.includes(user.role) ? "staff" : null;
}

/** Which `Order` timestamp a completed step stamps, if any. */
const STEP_TIMESTAMP: Partial<
  Record<
    DealMode,
    Record<
      number,
      "custodyAt" | "buyerPaidAt" | "sellerConfirmedAt" | "handoverAt"
    >
  >
> = {
  SAFEST: {
    4: "custodyAt",
    6: "buyerPaidAt",
    7: "sellerConfirmedAt",
    9: "handoverAt",
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
      status: { in: [...AGENT_HOLD_STATUSES] },
    },
  });
}

const AGENT_HOLD_STATUSES: readonly OrderStatus[] = [
  "AWAITING_CUSTODY",
  "IN_CUSTODY",
  "AWAITING_BUYER_PAYMENT",
  "AWAITING_HANDOVER",
];

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
    },
  });

  if (!order) return { ok: false, reason: "not-found" };
  if (isTerminal(order.status)) return { ok: false, reason: "terminal" };

  const assignee = await db.user.findUnique({
    where: { id: input.agentId },
    select: { role: true, bannedAt: true },
  });
  if (!assignee || assignee.role !== "AGENT" || assignee.bannedAt) {
    return { ok: false, reason: "wrong-actor" };
  }

  // Staff may place anyone. An agent may take an unclaimed deal for
  // themselves and nothing else — the queue has to work without a moderator
  // handing out every job, but an agent must not be able to take a channel
  // off a colleague or nominate who holds one. Being the buyer or the seller
  // is never enough: a seller could otherwise pick their own custodian.
  const actor = await roleOnDeal(order, input.byUserId);
  const claimingUnheld =
    order.agentId === null && input.byUserId === input.agentId;
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
            status: { in: [...AGENT_HOLD_STATUSES] },
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
  paymentRef?: string;
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

      const moved = await tx.order.updateMany({
        where: { id: order.id, status: order.status },
        data: {
          ...(template.entersStatus ? { status: template.entersStatus } : {}),
          ...(stamp ? { [stamp]: now } : {}),
          ...(input.paymentRef ? { buyerPaymentRef: input.paymentRef } : {}),
          ...(completing ? { completedAt: now } : {}),
        },
      });
      if (moved.count !== 1) throw new DealAbort("wrong-step");

      if (completing) await completeOrder(tx, order);
    });
  } catch (error) {
    if (error instanceof DealAbort) return { ok: false, reason: error.reason };
    throw error;
  }

  await notifyNextActor(order.id);

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
      ...(input.paymentRef ? { buyerPaymentRef: input.paymentRef } : {}),
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
};

/**
 * Finishing a deal: the listing is sold and, on Fastest, the money moves.
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
async function completeOrder(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  order: CompletableOrder,
) {
  await tx.listing.update({
    where: { id: order.listingId },
    data: { status: "SOLD" },
  });

  // Only Fastest pays anybody: it is the mode where the platform took the
  // money. A Safest seller was paid directly by the buyer at step 6.
  if (order.mode !== "FASTEST") return;

  await tx.ledgerEntry.createMany({
    data: [
      {
        orderId: order.id,
        userId: null,
        kind: "ESCROW_RELEASE",
        amountUsd: -order.totalUsd,
        note: "Hold released",
      },
      {
        orderId: order.id,
        userId: order.sellerId,
        kind: "ESCROW_RELEASE",
        amountUsd: order.priceUsd,
        note: "Sale released to seller",
      },
      {
        orderId: order.id,
        userId: null,
        kind: "BUYER_FEE",
        amountUsd: order.buyerFeeUsd,
        note: "Buyer fee",
      },
      ...(order.sellerFeeUsd > 0
        ? [
            {
              orderId: order.id,
              userId: order.sellerId,
              kind: "SELLER_FEE" as const,
              amountUsd: -order.sellerFeeUsd,
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
const PAYMENT_WINDOW_HOURS = 48;

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
  const cutoff = new Date(Date.now() - PAYMENT_WINDOW_HOURS * 60 * 60 * 1000);
  const stale = await db.order.findMany({
    where: {
      status: "AWAITING_PAYMENT",
      paymentRef: null,
      createdAt: { lt: cutoff },
      ...(scope.listingId ? { listingId: scope.listingId } : {}),
    },
    select: { id: true, listingId: true, status: true },
  });

  let expired = 0;
  for (const order of stale) {
    const moved = await db.order.updateMany({
      where: { id: order.id, status: "AWAITING_PAYMENT", paymentRef: null },
      data: { status: "PAYMENT_EXPIRED", cancelledAt: new Date() },
    });
    if (moved.count !== 1) continue;

    await db.listing.updateMany({
      where: { id: order.listingId, status: "RESERVED" },
      data: { status: "LIVE" },
    });
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
      custodyAt: true,
      sellerConfirmedAt: true,
    },
  });

  if (!order) return { ok: false, reason: "not-found" };
  if (isTerminal(order.status)) return { ok: false, reason: "terminal" };

  const actor = await roleOnDeal(order, input.byUserId);
  if (!actor) return { ok: false, reason: "wrong-actor" };
  if (!canTransition(order.mode, order.status, input.to, actor)) {
    return { ok: false, reason: "wrong-actor" };
  }

  // There is nothing to give back if nothing was ever taken. Reachable
  // because a dispute may be raised before payment, and the dispute outcomes
  // are not restricted to the states where the platform is holding funds.
  if (input.to === "REFUNDED" && !order.paymentRef) {
    return { ok: false, reason: "not-paid" };
  }

  // Once the seller has confirmed the buyer's payment arrived, handing the
  // channel back would leave them holding both the money and the asset. The
  // way out of a deal that far along is to finish it or to dispute it.
  if (input.to === "RETURNED_TO_SELLER" && order.sellerConfirmedAt) {
    return { ok: false, reason: "already-paid" };
  }

  const now = new Date();
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

      if (input.to === "REFUNDED") {
        // Returns the whole hold, so the platform's own position nets to zero.
        await tx.ledgerEntry.create({
          data: {
            orderId: order.id,
            userId: null,
            kind: "REFUND",
            amountUsd: -order.totalUsd,
            note: input.note,
          },
        });
        return;
      }

      // The admin fee buys the agent's work. Where the agent never got as far
      // as holding the channel, it was not earned — the spec says staff may
      // cancel and refund it, and /fees tells buyers there is no charge for a
      // deal that falls through. Once custody happened the fee stands.
      if (!order.custodyAt) {
        await tx.ledgerEntry.create({
          data: {
            orderId: order.id,
            userId: null,
            kind: "REFUND",
            amountUsd: -order.buyerFeeUsd,
            note: `Fee refunded: ${input.note}`,
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof DealAbort) return { ok: false, reason: error.reason };
    throw error;
  }

  if (input.to === "DISPUTED") {
    await notifyDealEnded(order.id, "Dispute raised");
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
  listingTitle: string;
  listingSlug: string;
  buyerName: string;
  sellerName: string;
  agentName: string | null;
  agentEmail: string | null;
  agentBrand: string | null;
  viewerRole: DealActor;
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
      buyerId: true,
      sellerId: true,
      agentId: true,
      agentEmail: true,
      agentBrand: true,
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
    listingTitle: order.listing.title,
    listingSlug: order.listing.slug,
    buyerName: order.buyer.name,
    sellerName: order.seller.name,
    agentName: order.agent?.name ?? null,
    agentEmail: order.agentEmail,
    agentBrand: order.agentBrand,
    viewerRole,
    steps,
    nextStep: isTerminal(order.status)
      ? null
      : (steps.find((s) => s.completedAt === null) ?? null),
  };
}
