import "server-only";

import type { PassPaidVia } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { nextPassPeriod, RESELLER_DAYS } from "@/lib/reseller";
import { isSerializationFailure } from "@/lib/serialization-failure";
import { recordAudit } from "@/server/audit";
import { canSendMail, sendMail } from "@/server/mailer";
import { notifyStaff } from "@/server/notifications";
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
 * One pass at a time. Paying again while one ran used to add 30 days on to
 * its end; the owner does not want that (2026-10-26), so a member holding
 * the badge cannot buy it again until it has ended.
 *
 * There is one way to buy a pass — spending the balance — and Cryptomus
 * reaches it by first crediting what arrived as a deposit, then buying at
 * the price its invoice asked. So a settled payment that cannot buy one (it
 * arrived short of the invoice) is simply the member's money in their
 * balance, and they are told so; a payment Cryptomus never settles is the
 * money desk's to look at, as any other invoice is.
 */

type BuyOutcome =
  | { ok: true; endsAt: Date; already: boolean }
  /**
   * `busy`: the database kept losing a serialisable race to other writes —
   * not to this member running short. Worth trying again; never a refusal.
   */
  | { ok: false; reason: "insufficient" | "busy" }
  /** They hold the badge already, until `endsAt`. Nothing was charged. */
  | { ok: false; reason: "active"; endsAt: Date };

/** How many times a purchase that lost a serialisable race is tried again. */
const ATTEMPTS = 6;

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

class PassAbort extends Error {}

/** Holding the badge already: it cannot be bought again until it ends. */
class StillActive extends Error {
  constructor(readonly endsAt: Date) {
    super("still active");
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
  /**
   * What to charge, in cents, when it is not today's price: a crypto badge
   * is charged what its invoice asked, never a price raised since.
   */
  priceUsd?: number;
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

  const price = input.priceUsd ?? (await getSettings()).resellerPriceUsd;
  const now = new Date();

  const attempt = () =>
    db.$transaction(
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
        // Inside the transaction, so two purchases at once cannot both see
        // no badge and both buy one.
        const latest = await tx.resellerPass.findFirst({
          where: { userId: input.userId },
          orderBy: { endsAt: "desc" },
          select: { endsAt: true },
        });
        if (latest && latest.endsAt > now) throw new StillActive(latest.endsAt);

        const available =
          (sum._sum.amountUsd ?? 0) - (pending._sum.amountUsd ?? 0);
        if (available < price) throw new PassAbort();

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

  let endsAt: Date | null = null;
  for (let tries = 1; endsAt === null; tries++) {
    try {
      endsAt = await attempt();
    } catch (error) {
      if (error instanceof PassAbort) {
        return { ok: false, reason: "insufficient" };
      }
      if (error instanceof StillActive) {
        return { ok: false, reason: "active", endsAt: error.endsAt };
      }
      // The same reference won a race to the insert: that pass is this one.
      if (isUniqueViolation(error)) {
        const won = await db.resellerPass.findUnique({
          where: { reference: input.reference },
          select: { endsAt: true },
        });
        if (won) return { ok: true, endsAt: won.endsAt, already: true };
      }
      // Serialisable conflicts are not about this member's money: Postgres
      // locks index pages, so two strangers buying at once collide. Read
      // again and decide again, which is what the isolation level is for.
      if (isSerializationFailure(error)) {
        if (tries >= ATTEMPTS) return { ok: false, reason: "busy" };
        await pause(15 * tries + Math.floor(Math.random() * 25));
        continue;
      }
      throw error;
    }
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
 * pass is bought from it under the invoice's own name, at the price the
 * invoice asked (or today's, if it has come down since).
 *
 * Throws when the database stays too busy to finish, so the webhook answers
 * 500 and is delivered again, and the sweep leaves the invoice open: a paid
 * badge is retried, never quietly left undelivered.
 */
export async function settleBadgePayment(
  reference: string,
  paidUsd: number,
  asset: string,
): Promise<"bought" | "already" | "credited-only" | "unknown"> {
  const invoice = await db.invoice.findUnique({
    where: { reference },
    select: { userId: true, purpose: true, amountUsd: true },
  });
  if (invoice?.purpose !== "BADGE") return "unknown";

  const bought = await db.resellerPass.count({ where: { reference } });
  if (bought > 0) return "already";

  const { resellerPriceUsd } = await getSettings();
  const price = Math.min(invoice.amountUsd, resellerPriceUsd);

  await creditDeposit(invoice.userId, paidUsd, reference, asset);
  // Short of what was asked: it is theirs, in their balance, and it does not
  // borrow the rest from money they had for something else.
  if (paidUsd < price) {
    await tellPaymentKept(invoice.userId);
    return "credited-only";
  }

  const pass = await buyResellerPass({
    userId: invoice.userId,
    reference,
    via: "CRYPTOMUS",
    priceUsd: price,
  });
  if (!pass.ok) {
    if (pass.reason === "busy") {
      throw new Error(`Badge ${reference}: the database stayed busy.`);
    }
    // Short of the price, or the badge was bought another way meanwhile.
    await tellPaymentKept(
      invoice.userId,
      pass.reason === "active" ? "active" : "short",
    );
    return "credited-only";
  }
  return pass.already ? "already" : "bought";
}

/** A badge payment that could not buy the badge is in the balance. */
async function tellPaymentKept(
  userId: string,
  why: "short" | "active" = "short",
) {
  await db.notification.create({
    data: {
      userId,
      kind: "BADGE",
      title: "Your payment is in your balance",
      body:
        why === "active"
          ? "You already hold the Reseller badge, so nothing was bought. The money is in your balance, to spend or withdraw."
          : "It did not cover the Reseller badge, so nothing was bought. The money is in your balance, to spend or withdraw.",
      href: "/dashboard/wallet#reseller",
    },
  });
}

/**
 * A top-up or badge payment the processor sent back after it reached the
 * member's balance.
 *
 * Nothing is clawed back automatically — the money may already be spent on
 * a deal or the badge, and a balance pushed below zero is a debt nobody
 * agreed to. It goes in front of finance instead, once, with the member it
 * concerns, to correct on the money desk.
 */
export async function reportRefundedDeposit(
  reference: string,
  status: string,
): Promise<boolean> {
  const invoice = await db.invoice.findUnique({
    where: { reference },
    select: { userId: true, purpose: true, amountUsd: true },
  });
  if (
    !invoice ||
    (invoice.purpose !== "TOPUP" && invoice.purpose !== "BADGE")
  ) {
    return false;
  }
  const seen = await db.auditLog.count({
    where: {
      action: "payment.refunded_by_processor",
      entityId: invoice.userId,
      after: { path: ["reference"], equals: reference },
    },
  });
  if (seen > 0) return false;

  await recordAudit({
    actorId: null,
    action: "payment.refunded_by_processor",
    entity: "user",
    entityId: invoice.userId,
    after: { reference, status, purpose: invoice.purpose },
  });
  const what =
    invoice.purpose === "BADGE" ? "Reseller badge payment" : "top-up";
  await notifyStaff(["FINANCE"], (staffId) => ({
    userId: staffId,
    kind: "PAYOUT",
    title: `Refunded by the processor: ${reference}`,
    body: `A ${what} was refunded in Cryptomus after it reached the member's balance. Check their balance and correct it on the money desk.`,
    href: `/admin/users/${invoice.userId}`,
  }));
  return true;
}

const REMIND_DAYS = 3;

/**
 * Telling holders, once, that their badge ends within three days.
 *
 * Only about the last pass: one already extended by a later pass, bought
 * before passes stopped stacking, ends nothing. There is no renewal on its
 * own, so without this the first a holder heard was their fee going back
 * up on a deal.
 */
export async function remindEndingPasses(
  now: Date = new Date(),
): Promise<number> {
  const soon = new Date(now.getTime() + REMIND_DAYS * 86_400_000);
  const { resellerPointsMultiplier: times, resellerDiscountBp } =
    await getSettings();
  const discount = `${resellerDiscountBp / 100}%`;
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
        body: `Once it ends you can take it again for 30 days, to keep your points counting ${times}x and your ${discount} fee discount.`,
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
            `Your Reseller badge ends on ${day}. After that your rating points count once instead of ${times} times, and the ${discount} discount on our fees ends.`,
            "",
            "Once it has ended you can take it again for 30 days from your wallet, from your balance or with crypto.",
          ].join("\n"),
          link: `${process.env.NEXT_PUBLIC_SITE_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/dashboard/wallet#reseller`,
          action: "Open your wallet",
        });
      } catch (error) {
        console.error(`[reseller] reminder for ${pass.userId}`, error);
      }
    }
    reminded += 1;
  }
  return reminded;
}
