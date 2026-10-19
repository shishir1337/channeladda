import "server-only";

import type { PassPaidVia } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { nextPassPeriod, RESELLER_DAYS } from "@/lib/reseller";
import { isSerializationFailure } from "@/lib/serialization-failure";
import { recordAudit } from "@/server/audit";
import { canSendMail, sendMail } from "@/server/mailer";
import { getSettings } from "@/server/settings";
import { creditDeposit, PENDING_WITHDRAWAL } from "@/server/wallet";

export {
  activeResellers,
  dealFees,
  ratingFor,
  resellerStatus,
} from "@/server/reseller-status";

/**
 * Buying the Reseller badge: 30 days at a time, from the balance or by
 * Cryptomus, and the reminder before it ends.
 *
 * There is one way to buy a pass — spending the balance — and Cryptomus
 * reaches it by first crediting what arrived as a deposit. So a payment that
 * can no longer buy one (the price went up in between, or it arrived short)
 * is simply the member's money in their balance, never lost and never half a
 * pass.
 */

type BuyOutcome =
  | { ok: true; endsAt: Date; already: boolean }
  | { ok: false; reason: "insufficient" };

class PassAbort extends Error {}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * A pass for 30 days, paid from the member's available balance.
 *
 * Idempotent on `reference`: a double click or a retried callback buys one
 * pass. The balance is re-read inside a Serializable transaction, as a deal
 * payment from the balance does, so two purchases at once cannot both spend
 * the same money — and money promised to a withdrawal is not available.
 */
export async function buyResellerPass(input: {
  userId: string;
  reference: string;
  via: PassPaidVia;
}): Promise<BuyOutcome> {
  const existing = await db.resellerPass.findUnique({
    where: { reference: input.reference },
    select: { userId: true, endsAt: true },
  });
  if (existing) {
    if (existing.userId !== input.userId) {
      throw new Error(`Pass ${input.reference} belongs to someone else.`);
    }
    return { ok: true, endsAt: existing.endsAt, already: true };
  }

  const { resellerPriceUsd: price } = await getSettings();
  const now = new Date();
  let endsAt: Date;
  try {
    endsAt = await db.$transaction(
      async (tx) => {
        const [sum, pending] = await Promise.all([
          tx.ledgerEntry.aggregate({
            where: { userId: input.userId },
            _sum: { amountUsd: true },
          }),
          tx.withdrawal.aggregate({
            where: {
              userId: input.userId,
              status: { in: [...PENDING_WITHDRAWAL] },
            },
            _sum: { amountUsd: true },
          }),
        ]);
        const available =
          (sum._sum.amountUsd ?? 0) - (pending._sum.amountUsd ?? 0);
        if (available < price) throw new PassAbort();

        const latest = await tx.resellerPass.findFirst({
          where: { userId: input.userId },
          orderBy: { endsAt: "desc" },
          select: { endsAt: true },
        });
        const period = nextPassPeriod(latest?.endsAt ?? null, now);
        await tx.resellerPass.create({
          data: {
            userId: input.userId,
            ...period,
            amountUsd: price,
            reference: input.reference,
            paidVia: input.via,
          },
        });
        await tx.ledgerEntry.createMany({
          data: [
            {
              userId: input.userId,
              kind: "BADGE_FEE",
              amountUsd: -price,
              note: `Reseller badge, ${RESELLER_DAYS} days`,
              externalRef: `badge:${input.reference}`,
            },
            {
              userId: null,
              kind: "BADGE_FEE",
              amountUsd: price,
              note: "Reseller badge",
            },
          ],
        });
        return period.endsAt;
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (error instanceof PassAbort)
      return { ok: false, reason: "insufficient" };
    // The same reference won a race to the insert: that pass is this one.
    if (isUniqueViolation(error)) {
      const won = await db.resellerPass.findUnique({
        where: { reference: input.reference },
        select: { endsAt: true },
      });
      if (won) return { ok: true, endsAt: won.endsAt, already: true };
    }
    // A lost serialisable race means somebody else spent the balance first.
    if (isSerializationFailure(error)) {
      return { ok: false, reason: "insufficient" };
    }
    throw error;
  }

  await recordAudit({
    actorId: input.via === "BALANCE" ? input.userId : null,
    action: "reseller.pass_bought",
    entity: "user",
    entityId: input.userId,
    after: { reference: input.reference, via: input.via, price, endsAt },
  });
  return { ok: true, endsAt, already: false };
}

/**
 * A badge invoice that Cryptomus says is paid — from the webhook or the
 * sweep, either or both. What arrived is credited to the balance, then the
 * pass is bought from it under the invoice's own name.
 */
export async function settleBadgePayment(
  reference: string,
  paidUsd: number,
  asset: string,
): Promise<"bought" | "already" | "credited-only" | "unknown"> {
  const invoice = await db.invoice.findUnique({
    where: { reference },
    select: { userId: true, purpose: true },
  });
  if (invoice?.purpose !== "BADGE") return "unknown";

  const bought = await db.resellerPass.count({ where: { reference } });
  if (bought > 0) return "already";

  await creditDeposit(invoice.userId, paidUsd, reference, asset);
  const pass = await buyResellerPass({
    userId: invoice.userId,
    reference,
    via: "CRYPTOMUS",
  });
  if (!pass.ok) return "credited-only";
  return pass.already ? "already" : "bought";
}

const REMIND_DAYS = 3;

/**
 * Telling holders, once, that their badge ends within three days.
 *
 * Only about the last pass: one already extended by a later pass ends
 * nothing. There is no renewal on its own, so without this the first a
 * holder heard was their fee going back up on a deal.
 */
export async function remindEndingPasses(
  now: Date = new Date(),
): Promise<number> {
  const soon = new Date(now.getTime() + REMIND_DAYS * 86_400_000);
  const ending = await db.resellerPass.findMany({
    where: { endsAt: { gt: now, lte: soon }, remindedAt: null },
    select: {
      id: true,
      userId: true,
      endsAt: true,
      user: { select: { email: true, name: true } },
    },
  });

  let reminded = 0;
  for (const pass of ending) {
    const later = await db.resellerPass.count({
      where: { userId: pass.userId, endsAt: { gt: pass.endsAt } },
    });
    if (later > 0) continue;

    const took = await db.resellerPass.updateMany({
      where: { id: pass.id, remindedAt: null },
      data: { remindedAt: now },
    });
    if (took.count !== 1) continue;

    const day = pass.endsAt.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
    });
    await db.notification.create({
      data: {
        userId: pass.userId,
        kind: "BADGE",
        title: `Your Reseller badge ends on ${day}`,
        body: "Extend it to keep your points tripled and your fee discount.",
        href: "/dashboard/wallet#reseller",
      },
    });
    if (canSendMail() && pass.user.email) {
      try {
        await sendMail({
          to: pass.user.email,
          subject: `Your Reseller badge ends on ${day}`,
          body: [
            pass.user.name ? `Hi ${pass.user.name},` : "Hi there,",
            "",
            `Your Reseller badge ends on ${day}. After that your rating points count once instead of three times, and deals are charged our full fee again.`,
            "",
            "You can extend it by 30 days from your wallet, from your balance or with crypto. Paying early adds the days on to the end.",
          ].join("\n"),
          link: `${process.env.NEXT_PUBLIC_SITE_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/dashboard/wallet#reseller`,
        });
      } catch (error) {
        console.error(`[reseller] reminder for ${pass.userId}`, error);
      }
    }
    reminded += 1;
  }
  return reminded;
}
