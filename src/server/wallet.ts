import "server-only";

import type { WithdrawalStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { canTransition } from "@/lib/deal-machine";
import { OPENING_STATUS } from "@/lib/deal-templates";
import { isSerializationFailure } from "@/lib/serialization-failure";
import { recordAudit } from "@/server/audit";
import { postEvent } from "@/server/chat-events";
import { notifyNextActor } from "@/server/deal-notify";
import { notify, notifyStaff } from "@/server/notifications";
import { getSettings } from "@/server/settings";

/**
 * Wallets.
 *
 * A balance is never stored. It is the sum of that user's own ledger rows, so
 * it cannot drift from the history that explains it — there is no counter to
 * get out of step with the entries, and no migration that can leave the two
 * disagreeing.
 *
 * Two numbers matter and they are not the same:
 *
 * - **balance** is everything credited less everything debited.
 * - **available** is the balance less anything already promised to a
 *   withdrawal that finance has not settled yet.
 *
 * Spending has to check `available`, or a seller could request a withdrawal
 * and then spend the same money on a deal while it sat in the queue.
 */

export type WalletFailure =
  | "not-found"
  | "wrong-actor"
  | "insufficient"
  | "no-address"
  | "below-minimum"
  /** The payout address was changed too recently to send to. */
  | "address-locked"
  | "already-settled"
  | "not-payable";

export type WalletOutcome<T = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; reason: WalletFailure };

class WalletAbort extends Error {
  constructor(readonly reason: WalletFailure) {
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

/** Statuses in which a withdrawal still has a claim on the balance. */
const PENDING_WITHDRAWAL: readonly WithdrawalStatus[] = [
  "REQUESTED",
  "APPROVED",
];

export type WalletEntry = {
  id: string;
  kind: string;
  amountUsd: number;
  note: string | null;
  createdAt: Date;
};

export type Wallet = {
  balanceUsd: number;
  /** Held against withdrawals finance has not settled. */
  pendingWithdrawalUsd: number;
  /** What can actually be spent or withdrawn now. */
  availableUsd: number;
  entries: WalletEntry[];
  payoutAddress: { address: string; network: string } | null;
};

export async function getWallet(userId: string): Promise<Wallet> {
  const [sum, pending, entries, payoutAddress] = await Promise.all([
    db.ledgerEntry.aggregate({
      where: { userId },
      _sum: { amountUsd: true },
    }),
    db.withdrawal.aggregate({
      where: { userId, status: { in: [...PENDING_WITHDRAWAL] } },
      _sum: { amountUsd: true },
    }),
    db.ledgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        kind: true,
        amountUsd: true,
        note: true,
        createdAt: true,
      },
    }),
    db.payoutAddress.findUnique({
      where: { userId },
      select: { address: true, network: true },
    }),
  ]);

  const balanceUsd = sum._sum.amountUsd ?? 0;
  const pendingWithdrawalUsd = pending._sum.amountUsd ?? 0;

  return {
    balanceUsd,
    pendingWithdrawalUsd,
    availableUsd: balanceUsd - pendingWithdrawalUsd,
    entries,
    payoutAddress,
  };
}

/**
 * Money arriving from outside.
 *
 * Idempotent on the processor's reference, because Cryptomus retries its
 * callbacks and crediting a deposit twice mints money out of nothing. The
 * reference is carried in the note and guarded by a unique index, so the
 * second attempt loses a race rather than doubling a balance.
 */
export async function creditDeposit(
  userId: string,
  amountUsd: number,
  reference: string,
  asset: string,
): Promise<void> {
  if (!Number.isInteger(amountUsd) || amountUsd <= 0) {
    throw new Error(`Refusing to credit a deposit of ${amountUsd} cents.`);
  }
  if (!reference) throw new Error("A deposit needs a processor reference.");

  const externalRef = depositNote(reference);

  try {
    await db.ledgerEntry.create({
      data: {
        userId,
        kind: "DEPOSIT",
        amountUsd,
        note: `Deposit in ${asset}`,
        externalRef,
      },
    });
  } catch (error) {
    // The unique index on externalRef is what makes this idempotent, and it
    // holds for two deliveries racing as well as for a sequential replay.
    // Checking first and inserting after would leave a window between them.
    if (isUniqueViolation(error)) return;
    throw error;
  }

  await recordAudit({
    actorId: null,
    action: "wallet.deposit",
    entity: "user",
    entityId: userId,
    after: { amountUsd, reference, asset },
  });
}

/** The handle a deposit is claimed under. Unique across the ledger. */
function depositNote(reference: string): string {
  return `deposit:${reference}`;
}

/**
 * Paying a deal out of the balance rather than raising a new invoice.
 *
 * The debit and the order's state change are one transaction, and the debit
 * re-checks the available balance inside it: two deals paid at the same
 * instant must not both spend one balance.
 */
export async function payFromWallet(
  orderId: string,
  userId: string,
): Promise<WalletOutcome> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      mode: true,
      status: true,
      buyerId: true,
      totalUsd: true,
      buyerFeeUsd: true,
      reference: true,
      paymentRef: true,
      conversationId: true,
    },
  });

  if (!order) return { ok: false, reason: "not-found" };
  if (order.buyerId !== userId) return { ok: false, reason: "wrong-actor" };
  if (order.status !== "AWAITING_PAYMENT" || order.paymentRef) {
    return { ok: false, reason: "not-payable" };
  }

  const target = OPENING_STATUS[order.mode];
  if (!canTransition(order.mode, order.status, target, "system")) {
    return { ok: false, reason: "not-payable" };
  }

  const now = new Date();
  try {
    await db.$transaction(
      async (tx) => {
        // Recomputed inside the transaction: the figure read before it began
        // is a guess by the time the write happens.
        const [sum, pending] = await Promise.all([
          tx.ledgerEntry.aggregate({
            where: { userId },
            _sum: { amountUsd: true },
          }),
          tx.withdrawal.aggregate({
            where: { userId, status: { in: [...PENDING_WITHDRAWAL] } },
            _sum: { amountUsd: true },
          }),
        ]);
        const available =
          (sum._sum.amountUsd ?? 0) - (pending._sum.amountUsd ?? 0);
        if (available < order.totalUsd) throw new WalletAbort("insufficient");

        const took = await tx.order.updateMany({
          where: {
            id: order.id,
            paymentRef: null,
            // As recordOpeningPayment does. Without the status, an order the
            // sweep expired mid-payment was written back to life with its
            // listing already reserved for somebody else: two live deals, one
            // channel, and a second seller payout for an account already gone.
            status: order.status,
          },
          data: {
            status: target,
            paymentRef: `wallet:${order.reference}`,
            paymentAsset: "WALLET",
            paidAt: now,
            feePaidAt: now,
          },
        });
        if (took.count !== 1) throw new WalletAbort("not-payable");

        await tx.transferStep.updateMany({
          where: { orderId: order.id, position: 1, completedAt: null },
          data: { completedAt: now },
        });

        // The buyer's side of the movement.
        await tx.ledgerEntry.create({
          data: {
            userId,
            orderId: order.id,
            kind: "ESCROW_HOLD",
            amountUsd: -order.totalUsd,
            note: `Paid deal ${order.reference} from balance`,
          },
        });

        // The platform's side, exactly as an external payment would record it.
        await tx.ledgerEntry.create({
          data: {
            orderId: order.id,
            userId: null,
            kind: order.mode === "FASTEST" ? "ESCROW_HOLD" : "BUYER_FEE",
            amountUsd:
              order.mode === "FASTEST" ? order.totalUsd : order.buyerFeeUsd,
            note: `${order.mode} opening payment from wallet`,
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (error instanceof WalletAbort) {
      return { ok: false, reason: error.reason };
    }
    // A lost serialisable race means somebody else spent the balance first.
    // The shape this project actually sees is a DriverAdapterError whose
    // cause carries kind: "TransactionWriteConflict" — not P2034, and not
    // reachable by JSON.stringify, because an Error's cause is
    // non-enumerable. Getting this wrong turned a lost race into a 500.
    if (isSerializationFailure(error)) {
      return { ok: false, reason: "insufficient" };
    }
    throw error;
  }

  // After the commit, not inside it: the transaction above is Serializable
  // and reports a lost race as "not enough balance", and a chat line written
  // in it touches the conversation every message touches. A message landing
  // at the same moment would have told the buyer they could not afford the
  // deal. A crash between the two loses this line, never the payment.
  if (order.conversationId) {
    await postEvent(db, {
      conversationId: order.conversationId,
      kind: "EVENT",
      event: { type: "payment-received", reference: order.reference },
      senderId: null,
      orderId: order.id,
      at: now,
    });
  }

  // The Cryptomus path has always told the next person; this one never did,
  // so a seller waited on a deal that was already paid.
  await notifyNextActor(order.id);

  await recordAudit({
    actorId: userId,
    action: "deal.fee_paid",
    entity: "order",
    entityId: order.id,
    after: { status: target, paymentRef: `wallet:${order.reference}` },
  });

  return { ok: true };
}

/** How long a withdrawal is held after the payout address is touched. */
export const PAYOUT_LOCK_HOURS = 24;

/**
 * Setting or changing where the money goes.
 *
 * Locks withdrawals for a day afterwards. Taking over an account and
 * re-pointing the payout address is how marketplace sellers actually lose
 * money, and the delay is the whole defence: the seller gets a window in
 * which to notice, and whoever stole the session gets nothing to show for
 * it. The help centre has promised this in so many words since launch; the
 * column existed, with a comment saying what it was for, and nothing ever
 * read or wrote it.
 *
 * Re-saving the same address is not a change and does not restart the clock,
 * or confirming the address you already have would cost you a day.
 */
export async function setPayoutAddress(
  userId: string,
  address: string,
  network: string,
): Promise<{ locked: boolean }> {
  const existing = await db.payoutAddress.findUnique({
    where: { userId },
    select: { address: true, network: true },
  });

  if (existing?.address === address && existing?.network === network) {
    return { locked: false };
  }

  const lockedUntil = new Date(Date.now() + PAYOUT_LOCK_HOURS * 3_600_000);
  await db.payoutAddress.upsert({
    where: { userId },
    create: { userId, address, network, lockedUntil },
    update: { address, network, lockedUntil },
  });

  return { locked: true };
}

/**
 * Asking for money out.
 *
 * The request itself holds the amount against the balance. It is not debited
 * until finance sends it, because until then it is still the user's money and
 * a rejection has to leave it where it was — but it must not be spendable in
 * the meantime either, which is what `availableUsd` is for.
 */
export async function requestWithdrawal(
  userId: string,
  amountUsd: number,
): Promise<WalletOutcome<{ withdrawalId: string }>> {
  if (!Number.isInteger(amountUsd) || amountUsd <= 0) {
    return { ok: false, reason: "insufficient" };
  }

  // Checked before the balance, because a seller asking for two dollars
  // needs to be told the floor, not that they cannot afford it.
  const { minWithdrawalUsd } = await getSettings();
  if (amountUsd < minWithdrawalUsd) {
    return { ok: false, reason: "below-minimum" };
  }

  const address = await db.payoutAddress.findUnique({
    where: { userId },
    select: { address: true, network: true, lockedUntil: true },
  });
  if (!address) return { ok: false, reason: "no-address" };

  // The cooling-off after the address was last touched.
  if (address.lockedUntil && address.lockedUntil > new Date()) {
    return { ok: false, reason: "address-locked" };
  }

  let withdrawalId = "";
  try {
    await db.$transaction(
      async (tx) => {
        const [sum, pending] = await Promise.all([
          tx.ledgerEntry.aggregate({
            where: { userId },
            _sum: { amountUsd: true },
          }),
          tx.withdrawal.aggregate({
            where: { userId, status: { in: [...PENDING_WITHDRAWAL] } },
            _sum: { amountUsd: true },
          }),
        ]);
        const available =
          (sum._sum.amountUsd ?? 0) - (pending._sum.amountUsd ?? 0);
        if (available < amountUsd) throw new WalletAbort("insufficient");

        const created = await tx.withdrawal.create({
          data: {
            userId,
            amountUsd,
            address: address.address,
            network: address.network,
            status: "REQUESTED",
          },
          select: { id: true },
        });
        withdrawalId = created.id;
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (error instanceof WalletAbort) {
      return { ok: false, reason: error.reason };
    }
    // The shape this project actually sees is a DriverAdapterError whose
    // cause carries kind: "TransactionWriteConflict" — not P2034, and not
    // reachable by JSON.stringify, because an Error's cause is
    // non-enumerable. Getting this wrong turned a lost race into a 500.
    if (isSerializationFailure(error)) {
      return { ok: false, reason: "insufficient" };
    }
    throw error;
  }

  await recordAudit({
    actorId: userId,
    action: "wallet.withdrawal_requested",
    entity: "withdrawal",
    entityId: withdrawalId,
    after: { amountUsd, network: address.network },
  });

  // Finance is who acts on this, and nothing used to tell them.
  const amount = (amountUsd / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  await notifyStaff(["FINANCE"], (staffId) => ({
    userId: staffId,
    kind: "PAYOUT",
    title: `${amount} payout requested`,
    body: "Waiting on the finance desk. The amount is held against the seller’s balance until it is sent or refused.",
    href: "/admin/payouts",
  }));
  return { ok: true, withdrawalId };
}

/**
 * Finance deciding a withdrawal.
 *
 * `SENT` is the only outcome that debits, and it is a compare-and-set on the
 * pending status so a double-click cannot debit twice. `REJECTED` writes
 * nothing: the hold simply stops counting, which returns the money to the
 * available balance without a compensating entry nobody can explain.
 */
export async function settleWithdrawal(
  withdrawalId: string,
  byUserId: string,
  to: "SENT" | "REJECTED",
  txHash: string | null,
  note?: string,
): Promise<WalletOutcome> {
  const staff = await db.user.findUnique({
    where: { id: byUserId },
    select: { role: true, bannedAt: true },
  });
  if (
    !staff ||
    staff.bannedAt ||
    (staff.role !== "FINANCE" && staff.role !== "SUPERADMIN")
  ) {
    return { ok: false, reason: "wrong-actor" };
  }

  const withdrawal = await db.withdrawal.findUnique({
    where: { id: withdrawalId },
    select: { id: true, userId: true, amountUsd: true, status: true },
  });
  if (!withdrawal) return { ok: false, reason: "not-found" };
  if (!PENDING_WITHDRAWAL.includes(withdrawal.status)) {
    return { ok: false, reason: "already-settled" };
  }

  const now = new Date();
  try {
    await db.$transaction(async (tx) => {
      const moved = await tx.withdrawal.updateMany({
        where: { id: withdrawal.id, status: { in: [...PENDING_WITHDRAWAL] } },
        data: {
          status: to,
          txHash: txHash ?? undefined,
          reviewerId: byUserId,
          rejectNote: to === "REJECTED" ? (note ?? null) : null,
          settledAt: now,
        },
      });
      if (moved.count !== 1) throw new WalletAbort("already-settled");

      if (to !== "SENT") return;

      await tx.ledgerEntry.create({
        data: {
          userId: withdrawal.userId,
          kind: "WITHDRAWAL",
          amountUsd: -withdrawal.amountUsd,
          note: `Withdrawal ${withdrawal.id}${txHash ? ` (${txHash})` : ""}`,
        },
      });
    });
  } catch (error) {
    if (error instanceof WalletAbort) {
      return { ok: false, reason: error.reason };
    }
    throw error;
  }

  await recordAudit({
    actorId: byUserId,
    action: `wallet.withdrawal_${to.toLowerCase()}`,
    entity: "withdrawal",
    entityId: withdrawal.id,
    before: { status: withdrawal.status },
    after: { status: to, txHash, amountUsd: withdrawal.amountUsd },
  });

  // Somebody asked for their money and a human decided. Silence here is
  // the single most alarming thing this product can do: the amount has
  // been held against their balance since they asked, so from the outside
  // an unanswered payout and a frozen account look identical.
  const amount = (withdrawal.amountUsd / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const sent = to === "SENT";
  await notify({
    userId: withdrawal.userId,
    kind: "PAYOUT",
    title: sent
      ? `${amount} is on its way`
      : `Your ${amount} payout was not sent`,
    body: sent
      ? `Sent to your payout address.${txHash ? ` Transaction ${txHash}.` : ""} Blockchain confirmation times vary.`
      : `${note?.trim() || "Finance could not send this one."} The amount is back in your available balance.`,
    href: "/dashboard/wallet",
    email: {
      subject: sent ? `${amount} sent` : `${amount} payout not sent`,
      body: sent
        ? [
            `Your withdrawal of ${amount} has been sent to your payout address.`,
            txHash ? `Transaction: ${txHash}` : "",
            "",
            "How long it takes to appear depends on the network, not on us.",
          ]
            .filter(Boolean)
            .join("\n")
        : [
            `Finance could not send your withdrawal of ${amount}.`,
            "",
            note?.trim() || "No reason was given.",
            "",
            "The amount is back in your available balance, so you can ask again.",
          ].join("\n"),
    },
  });

  return { ok: true };
}

/** The finance queue: everything waiting on a decision, oldest first. */
export async function listPendingWithdrawals(limit = 50) {
  return db.withdrawal.findMany({
    where: { status: { in: [...PENDING_WITHDRAWAL] } },
    orderBy: { requestedAt: "asc" },
    take: limit,
    select: {
      id: true,
      amountUsd: true,
      address: true,
      network: true,
      status: true,
      requestedAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
}
