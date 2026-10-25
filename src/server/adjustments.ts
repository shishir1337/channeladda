import "server-only";

import type { UserRole, WithdrawalStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { BALANCE_CORRECTION_BODY } from "@/lib/notification-text";
import { isSerializationFailure } from "@/lib/serialization-failure";
import { recordAudit } from "@/server/audit";
import { notify } from "@/server/notifications";
import { getWallet, type Wallet } from "@/server/wallet";

/**
 * Balance corrections.
 *
 * "We owe this person $20" used to be an INSERT. This is the version with
 * the controls an INSERT does not have:
 *
 * - **Who.** FINANCE or SUPERADMIN, read from the database rather than the
 *   session, and never on their own balance.
 * - **How much.** A finance clerk may add at most `FINANCE_CREDIT_CAP_USD`
 *   to any one member in a rolling `CREDIT_WINDOW_HOURS`; more needs a
 *   superadmin. Counted across every correction in the window, not per
 *   correction, or the cap is one extra click away. A staff account's
 *   balance always needs a superadmin, so two clerks cannot top each other
 *   up. Nothing anybody types can exceed `MAX_ADJUSTMENT_USD` at once — that
 *   ceiling is for an extra zero, not for policy.
 * - **Why.** A reason of at least `MIN_REASON_LENGTH` characters. The
 *   member reads it word for word on their wallet, which is what the wallet
 *   page has promised since it learned to render this kind.
 * - **Never below what is promised.** A debit may not take the balance under
 *   the total of withdrawals finance has not yet settled — the same
 *   "available" figure `requestWithdrawal` spends against.
 * - **The books still balance.** Every correction is two rows: the member's,
 *   and the platform's opposite, exactly the way `completeOrder` and the
 *   refund in `resolveDeal` pair theirs. A credit is money the platform
 *   gives away, so it comes out of the platform's own position; a debit
 *   goes back into it.
 * - **Once.** The form sends a one-off key, kept on the member's row under
 *   the ledger's unique `externalRef`, so a double-click or a retried
 *   request cannot apply the same correction twice.
 */

/**
 * $500, in cents, per member per rolling day.
 *
 * Large enough for what the desk actually corrects — a goodwill credit, an
 * admin fee that should have been refunded (3% of a $16,000 sale), a
 * payment credited short — and small enough that one compromised or
 * careless finance login cannot hand anybody a sum that matters without a
 * second, more senior person. It is 25 minimum withdrawals, not a sale price.
 */
export const FINANCE_CREDIT_CAP_USD = 50_000;
export const CREDIT_WINDOW_HOURS = 24;
/** $100,000, in cents. An obvious-mistake ceiling, for everybody. */
export const MAX_ADJUSTMENT_USD = 10_000_000;
export const MIN_REASON_LENGTH = 10;
export const MAX_REASON_LENGTH = 500;

const PENDING_WITHDRAWAL: readonly WithdrawalStatus[] = [
  "REQUESTED",
  "APPROVED",
];

const KEY_PATTERN = /^[A-Za-z0-9-]{16,64}$/;

export type AdjustmentFailure =
  /** Not finance or a superadmin, or suspended. */
  | "wrong-actor"
  /** Nobody corrects their own balance. */
  | "self"
  | "not-found"
  /** The member is staff, and only a superadmin corrects staff balances. */
  | "staff-account"
  | "bad-amount"
  | "too-large"
  | "reason-too-short"
  | "reason-too-long"
  /** Over the finance cap for this member in the window. */
  | "needs-superadmin"
  /** A debit would dig into money promised to a pending withdrawal. */
  | "insufficient"
  /** Somebody else changed this balance at the same instant. */
  | "conflict"
  /** This exact correction has already been recorded. */
  | "duplicate"
  /** The one-off key the form sends was missing or malformed. */
  | "bad-key";

export type AdjustmentOutcome =
  | {
      ok: true;
      entryId: string;
      /** The member's balance and available balance after the correction. */
      balanceUsd: number;
      availableUsd: number;
    }
  | { ok: false; reason: AdjustmentFailure };

class AdjustmentAbort extends Error {
  constructor(readonly reason: AdjustmentFailure) {
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

const MONEY_DESK: readonly UserRole[] = ["FINANCE", "SUPERADMIN"];

function usd(cents: number): string {
  return (Math.abs(cents) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export async function adjustBalance(input: {
  /** The member whose balance changes. */
  userId: string;
  /** Signed integer cents: positive credits the member, negative debits. */
  amountUsd: number;
  reason: string;
  byUserId: string;
  /** A one-off key from the form, so a retry cannot apply this twice. */
  key?: string;
}): Promise<AdjustmentOutcome> {
  // Who is asking comes first, so a refusal says nothing about the member,
  // the amount or the rules to somebody with no business asking.
  const actor = await db.user.findUnique({
    where: { id: input.byUserId },
    select: { id: true, role: true, bannedAt: true },
  });
  if (!actor || actor.bannedAt || !MONEY_DESK.includes(actor.role)) {
    return { ok: false, reason: "wrong-actor" };
  }
  if (input.userId === actor.id) return { ok: false, reason: "self" };

  const amount = input.amountUsd;
  if (!Number.isSafeInteger(amount) || amount === 0) {
    return { ok: false, reason: "bad-amount" };
  }
  if (Math.abs(amount) > MAX_ADJUSTMENT_USD) {
    return { ok: false, reason: "too-large" };
  }

  const reason = input.reason.trim().replace(/\s+/g, " ");
  if (reason.length < MIN_REASON_LENGTH) {
    return { ok: false, reason: "reason-too-short" };
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return { ok: false, reason: "reason-too-long" };
  }

  if (input.key !== undefined && !KEY_PATTERN.test(input.key)) {
    return { ok: false, reason: "bad-key" };
  }

  const member = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, role: true, email: true },
  });
  if (!member) return { ok: false, reason: "not-found" };

  const superadmin = actor.role === "SUPERADMIN";
  if (member.role !== "USER" && !superadmin) {
    return { ok: false, reason: "staff-account" };
  }

  const since = new Date(Date.now() - CREDIT_WINDOW_HOURS * 3_600_000);
  let before = { balanceUsd: 0, availableUsd: 0 };
  let entryId = "";

  try {
    await db.$transaction(
      async (tx) => {
        // Recomputed inside the transaction, as `requestWithdrawal` does:
        // the figures read before it began are a guess by the time the
        // write happens, and two corrections racing must not both pass.
        const [sum, pending, recentCredits] = await Promise.all([
          tx.ledgerEntry.aggregate({
            where: { userId: member.id },
            _sum: { amountUsd: true },
          }),
          tx.withdrawal.aggregate({
            where: {
              userId: member.id,
              status: { in: [...PENDING_WITHDRAWAL] },
            },
            _sum: { amountUsd: true },
          }),
          amount > 0 && !superadmin
            ? tx.ledgerEntry.aggregate({
                where: {
                  userId: member.id,
                  kind: "ADJUSTMENT",
                  amountUsd: { gt: 0 },
                  createdAt: { gte: since },
                },
                _sum: { amountUsd: true },
              })
            : null,
        ]);

        const balanceUsd = sum._sum.amountUsd ?? 0;
        const availableUsd = balanceUsd - (pending._sum.amountUsd ?? 0);
        before = { balanceUsd, availableUsd };

        if (amount < 0 && availableUsd + amount < 0) {
          throw new AdjustmentAbort("insufficient");
        }
        if (
          recentCredits &&
          (recentCredits._sum.amountUsd ?? 0) + amount > FINANCE_CREDIT_CAP_USD
        ) {
          throw new AdjustmentAbort("needs-superadmin");
        }

        // The member's side. The reason is the note, because the wallet
        // page shows a correction's note to the member as its explanation.
        const entry = await tx.ledgerEntry.create({
          data: {
            userId: member.id,
            kind: "ADJUSTMENT",
            amountUsd: amount,
            note: reason,
            externalRef: input.key ? `adjust:${input.key}` : null,
          },
          select: { id: true },
        });
        entryId = entry.id;

        // The platform's side: the opposite amount, so the two rows sum to
        // zero and the books balance. Platform rows have no user, so the
        // note is what ties this one to the member in an export.
        await tx.ledgerEntry.create({
          data: {
            userId: null,
            kind: "ADJUSTMENT",
            amountUsd: -amount,
            note: `Balance correction for ${member.email} (${member.id}): ${reason}`,
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (error instanceof AdjustmentAbort) {
      return { ok: false, reason: error.reason };
    }
    if (isUniqueViolation(error)) return { ok: false, reason: "duplicate" };
    // The same shapes `requestWithdrawal` catches: a lost serialisable race
    // is an ordinary event, not a 500.
    if (isSerializationFailure(error)) {
      return { ok: false, reason: "conflict" };
    }
    throw error;
  }

  const after = {
    balanceUsd: before.balanceUsd + amount,
    availableUsd: before.availableUsd + amount,
  };

  await recordAudit({
    actorId: actor.id,
    action: "wallet.adjustment",
    entity: "user",
    entityId: member.id,
    before,
    after: { ...after, amountUsd: amount, reason, entryId },
  });

  // Silence about somebody's own money is the thing this product has
  // decided it will not do — see `settleWithdrawal`. Best effort: the
  // correction has happened whether or not the message gets out.
  const credit = amount > 0;
  await notify({
    userId: member.id,
    kind: "PAYOUT",
    title: credit
      ? `${usd(amount)} added to your balance`
      : `${usd(amount)} taken from your balance`,
    body: `${BALANCE_CORRECTION_BODY}: ${reason}`,
    href: "/dashboard/wallet",
    email: {
      subject: credit
        ? `${usd(amount)} added to your Channel Adda balance`
        : `${usd(amount)} taken from your Channel Adda balance`,
      body: [
        credit
          ? `We have added ${usd(amount)} to your Channel Adda balance.`
          : `We have taken ${usd(amount)} from your Channel Adda balance.`,
        "",
        `Why: ${reason}`,
        "",
        "It is listed on your wallet page as a correction. If this looks wrong, reply to this email or contact support.",
      ].join("\n"),
    },
  });

  return { ok: true, entryId, ...after };
}

// ------------------------------------------------------------------- reads

export type AdjustableMember = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  banned: boolean;
  wallet: Wallet;
};

/**
 * A member to correct, by email address or by id.
 *
 * Exact matches only. A correction should land on the person somebody
 * meant, not on the first of several partial matches.
 */
export async function findMember(
  query: string,
): Promise<AdjustableMember | null> {
  const q = query.trim();
  if (!q || q.length > 200) return null;

  const user = await db.user.findFirst({
    where: q.includes("@")
      ? { email: { equals: q, mode: "insensitive" } }
      : { id: q },
    select: { id: true, name: true, email: true, role: true, bannedAt: true },
  });
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    banned: user.bannedAt !== null,
    wallet: await getWallet(user.id),
  };
}

export type AdjustmentRow = {
  id: string;
  amountUsd: number;
  reason: string | null;
  createdAt: Date;
  member: { id: string; name: string; email: string };
  /** From the audit trail, which is best effort; null if it has a hole. */
  byName: string | null;
};

/** The most recent corrections, newest first, with who made each one. */
export async function listRecentAdjustments(
  limit = 25,
): Promise<AdjustmentRow[]> {
  const entries = await db.ledgerEntry.findMany({
    where: { kind: "ADJUSTMENT", userId: { not: null } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      amountUsd: true,
      note: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (entries.length === 0) return [];

  // The ledger row has no actor column; the audit row written alongside it
  // does, and carries the ledger row's id in `after.entryId`.
  const audits = await db.auditLog.findMany({
    where: {
      action: "wallet.adjustment",
      entity: "user",
      entityId: {
        in: [...new Set(entries.flatMap((e) => (e.user ? [e.user.id] : [])))],
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit * 4,
    select: { after: true, actor: { select: { name: true } } },
  });
  const byEntry = new Map<string, string | null>();
  for (const audit of audits) {
    const after = audit.after as { entryId?: unknown } | null;
    if (after && typeof after.entryId === "string") {
      byEntry.set(after.entryId, audit.actor?.name ?? null);
    }
  }

  return entries.flatMap((entry) =>
    entry.user
      ? [
          {
            id: entry.id,
            amountUsd: entry.amountUsd,
            reason: entry.note,
            createdAt: entry.createdAt,
            member: entry.user,
            byName: byEntry.get(entry.id) ?? null,
          },
        ]
      : [],
  );
}
