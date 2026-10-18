import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type {
  DealMode,
  InvoicePurpose,
  OrderStatus,
  WithdrawalStatus,
} from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { isTerminal, TERMINAL_STATUSES } from "@/lib/deal-machine";
import { requiredHold } from "@/lib/holds";

/**
 * The money desk, and the lookups the operator audit found missing.
 *
 * Everything here reads; nothing writes. Balance corrections live in
 * `@/server/adjustments`, because a module that only reads can be trusted
 * with a wider audience than one that moves money.
 *
 * The figures are sums of `LedgerEntry` rows and nothing else — never of
 * `Order` columns. An order says what *should* have happened; the ledger says
 * what was written down, and a report that disagreed with the ledger would be
 * a second set of books. Which rows mean what, in short:
 *
 * - **Platform rows** have `userId: null`. Every payment a buyer makes is one
 *   `ESCROW_HOLD` row: price + fee on a Fastest opening payment, the fee on
 *   a Safest one and the price when a Safest buyer pays it later. Completion
 *   writes `ESCROW_RELEASE` for minus the whole hold, then `BUYER_FEE` and
 *   `SELLER_FEE` for what we keep. A refund is `REFUND` for minus what goes
 *   back; a Safest fee kept after custody is released and booked as
 *   `BUYER_FEE` the same way.
 * - **Member rows** carry a `userId`, and their sum is that member's balance.
 *
 * So "fees earned" is the platform's `BUYER_FEE` and `SELLER_FEE` rows,
 * "held for buyers" is the platform's hold, release and refund rows (they
 * net to zero once a deal ends), and revenue is never the price.
 *
 * Months run midnight to midnight UTC, and say so on the page.
 */

// ------------------------------------------------------------------ months

export type Month = {
  /** "2026-10" — what the URL and the CSV filenames carry. */
  key: string;
  /** First instant of the month, UTC. Inclusive. */
  start: Date;
  /** First instant of the next month, UTC. Exclusive. */
  end: Date;
  /** "October 2026" */
  label: string;
};

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Nothing on this platform predates it, and a typo should not query 1970. */
const EARLIEST_YEAR = 2020;

function monthAt(year: number, index: number): Month {
  const start = new Date(Date.UTC(year, index, 1));
  const end = new Date(Date.UTC(year, index + 1, 1));
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth();
  return {
    key: `${y}-${String(m + 1).padStart(2, "0")}`,
    start,
    end,
    label: start.toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  };
}

export function monthOf(date: Date): Month {
  return monthAt(date.getUTCFullYear(), date.getUTCMonth());
}

/**
 * A month from the query string, or the current one.
 *
 * Anything that is not `YYYY-MM` inside a sane range falls back rather than
 * erroring: this arrives from a URL somebody may have typed or bookmarked.
 */
export function parseMonth(input: unknown, now: Date = new Date()): Month {
  if (typeof input === "string") {
    const match = MONTH_KEY.exec(input.trim());
    if (match) {
      const year = Number(match[1]);
      if (year >= EARLIEST_YEAR && year <= now.getUTCFullYear() + 1) {
        return monthAt(year, Number(match[2]) - 1);
      }
    }
  }
  return monthOf(now);
}

export function shiftMonth(month: Month, by: number): Month {
  return monthAt(month.start.getUTCFullYear(), month.start.getUTCMonth() + by);
}

/** The current month and the ones before it, newest first. */
export function recentMonths(count: number, now: Date = new Date()): Month[] {
  const current = monthOf(now);
  return Array.from({ length: count }, (_, i) => shiftMonth(current, -i));
}

// ----------------------------------------------------------------- figures

/** A sum in integer cents, and how many ledger rows it came from. */
export type Figure = { cents: number; count: number };

const PLATFORM: Prisma.LedgerEntryWhereInput = { userId: null };
const MEMBER: Prisma.LedgerEntryWhereInput = { userId: { not: null } };

function onMode(mode: DealMode): Prisma.LedgerEntryWhereInput {
  return { order: { is: { mode } } };
}

/**
 * Money the platform is holding on behalf of buyers, in both modes.
 *
 * The holds, their release and any refund. They sum to what a running deal
 * has paid in — price and fee on Fastest, the fee and then the price on
 * Safest — and to exactly zero once it has ended either way. Fees we keep
 * are booked separately as `BUYER_FEE` and `SELLER_FEE`, so they are not
 * counted here.
 */
const HELD_FOR_BUYERS: Prisma.LedgerEntryWhereInput = {
  userId: null,
  kind: { in: ["ESCROW_HOLD", "ESCROW_RELEASE", "REFUND"] },
};

async function figure(
  where: Prisma.LedgerEntryWhereInput,
  /** Debits are stored negative; a report states them as positive amounts. */
  negate = false,
): Promise<Figure> {
  const result = await db.ledgerEntry.aggregate({
    where,
    _sum: { amountUsd: true },
    _count: { _all: true },
  });
  const sum = result._sum.amountUsd ?? 0;
  // `0 - x` rather than `-x`, so an empty month is 0 and not -0, which
  // formats as "-$0".
  return { cents: negate ? 0 - sum : sum, count: result._count._all };
}

async function sumOf(where: Prisma.LedgerEntryWhereInput): Promise<number> {
  const result = await db.ledgerEntry.aggregate({
    where,
    _sum: { amountUsd: true },
  });
  return result._sum.amountUsd ?? 0;
}

export type MonthFigures = {
  month: Month;
  fees: {
    safest: { buyer: Figure; seller: Figure };
    fastest: { buyer: Figure; seller: Figure };
    /**
     * Every fee above: the month's revenue. A fee is booked only when it is
     * earned, so a refund is never revenue given back — it is held money
     * going home, and is counted under `refunds`.
     */
    net: number;
  };
  deals: {
    /** Everything buyers paid into our hold: fees and prices, both modes. */
    paidIn: Figure;
    /** Credited to sellers' wallets on completion: price less seller fee. */
    toSellers: Figure;
  };
  refunds: {
    /** What was still held, returned on a Fastest deal that did not complete. */
    fastest: Figure;
    /** What was still held, less any fee earned, on a Safest deal that ended. */
    safest: Figure;
    total: number;
  };
  deposits: {
    /** A member topping up their own balance. */
    topUps: Figure;
    /** A deal payment that arrived late or twice, credited to the payer. */
    dealPayments: Figure;
  };
  /** Members paying a deal out of their balance rather than by crypto. */
  spentFromBalances: Figure;
  /** Withdrawals sent to members' own wallets. Positive. */
  payouts: Figure;
  adjustments: { credits: Figure; debits: Figure };
  /** Where things stood when the month closed, or now if it has not. */
  closing: { asOf: Date; heldForBuyers: number; memberBalances: number };
};

/**
 * Everything the ledger says happened in one month.
 *
 * Each figure is one aggregate over one plain filter, so what a number on
 * the page counts can be read straight off the line that computes it.
 */
export async function monthFigures(
  month: Month,
  now: Date = new Date(),
): Promise<MonthFigures> {
  const during: Prisma.LedgerEntryWhereInput = {
    createdAt: { gte: month.start, lt: month.end },
  };
  const rows = (...where: Prisma.LedgerEntryWhereInput[]) => ({
    AND: [during, ...where],
  });

  const [
    safestBuyer,
    safestSeller,
    fastestBuyer,
    fastestSeller,
    refundedSafest,
    refundedFastest,
    paidIn,
    released,
    sellerFeesTaken,
    topUps,
    dealPayments,
    spent,
    payouts,
    credits,
    debits,
  ] = await Promise.all([
    figure(rows(PLATFORM, { kind: "BUYER_FEE" }, onMode("SAFEST"))),
    figure(rows(PLATFORM, { kind: "SELLER_FEE" }, onMode("SAFEST"))),
    figure(rows(PLATFORM, { kind: "BUYER_FEE" }, onMode("FASTEST"))),
    figure(rows(PLATFORM, { kind: "SELLER_FEE" }, onMode("FASTEST"))),
    figure(rows(PLATFORM, { kind: "REFUND" }, onMode("SAFEST")), true),
    figure(rows(PLATFORM, { kind: "REFUND" }, onMode("FASTEST")), true),
    figure(rows(PLATFORM, { kind: "ESCROW_HOLD" })),
    figure(rows(MEMBER, { kind: "ESCROW_RELEASE" })),
    figure(rows(MEMBER, { kind: "SELLER_FEE" })),
    figure(rows(MEMBER, { kind: "DEPOSIT", orderId: null })),
    figure(rows(MEMBER, { kind: "DEPOSIT", orderId: { not: null } })),
    figure(rows(MEMBER, { kind: "ESCROW_HOLD" }), true),
    figure(rows(MEMBER, { kind: "WITHDRAWAL" }), true),
    figure(rows(MEMBER, { kind: "ADJUSTMENT", amountUsd: { gt: 0 } })),
    figure(rows(MEMBER, { kind: "ADJUSTMENT", amountUsd: { lt: 0 } }), true),
  ]);

  const asOf = month.end < now ? month.end : now;
  const [heldForBuyers, memberBalances] = await Promise.all([
    sumOf({ AND: [HELD_FOR_BUYERS, { createdAt: { lt: asOf } }] }),
    sumOf({ AND: [MEMBER, { createdAt: { lt: asOf } }] }),
  ]);

  const earned =
    safestBuyer.cents +
    safestSeller.cents +
    fastestBuyer.cents +
    fastestSeller.cents;

  return {
    month,
    fees: {
      safest: { buyer: safestBuyer, seller: safestSeller },
      fastest: { buyer: fastestBuyer, seller: fastestSeller },
      net: earned,
    },
    deals: {
      paidIn,
      // The seller's fee is its own (negative) row, so what actually landed
      // in sellers' wallets is the release plus that.
      toSellers: {
        cents: released.cents + sellerFeesTaken.cents,
        count: released.count,
      },
    },
    refunds: {
      fastest: refundedFastest,
      safest: refundedSafest,
      total: refundedFastest.cents + refundedSafest.cents,
    },
    deposits: { topUps, dealPayments },
    spentFromBalances: spent,
    payouts,
    adjustments: { credits, debits },
    closing: { asOf, heldForBuyers, memberBalances },
  };
}

// ---------------------------------------------------------------- position

const PENDING_WITHDRAWAL: readonly WithdrawalStatus[] = [
  "REQUESTED",
  "APPROVED",
];

export type Position = {
  /** What running deals have paid in. `count` is deals, not rows. */
  heldForBuyers: Figure;
  /** Every member balance added together: what we owe members. */
  memberBalances: Figure;
  /** Requested, not yet sent. Already inside `memberBalances`. */
  pendingPayouts: Figure;
  /** Fees kept, less fees given back and corrections we paid for. */
  platformOwn: number;
  /** All of the above that is money: what our accounts should hold. */
  onHand: number;
};

/** Where the money is right now, as the ledger tells it. */
export async function moneyPosition(): Promise<Position> {
  const [held, heldDeals, members, membersInCredit, platform, pending] =
    await Promise.all([
      sumOf(HELD_FOR_BUYERS),
      db.ledgerEntry.groupBy({
        by: ["orderId"],
        where: HELD_FOR_BUYERS,
        _sum: { amountUsd: true },
        having: { amountUsd: { _sum: { not: 0 } } },
      }),
      sumOf(MEMBER),
      db.ledgerEntry.groupBy({
        by: ["userId"],
        where: MEMBER,
        _sum: { amountUsd: true },
        having: { amountUsd: { _sum: { not: 0 } } },
      }),
      sumOf(PLATFORM),
      db.withdrawal.aggregate({
        where: { status: { in: [...PENDING_WITHDRAWAL] } },
        _sum: { amountUsd: true },
        _count: { _all: true },
      }),
    ]);

  return {
    heldForBuyers: { cents: held, count: heldDeals.length },
    memberBalances: { cents: members, count: membersInCredit.length },
    pendingPayouts: {
      cents: pending._sum.amountUsd ?? 0,
      count: pending._count._all,
    },
    platformOwn: platform - held,
    // Every internal movement is a pair that nets to zero, so what is left
    // when every row is added up is exactly what came in from outside less
    // what went out: deposits and crypto payments, less payouts.
    onHand: members + platform,
  };
}

export type HoldMismatch = {
  id: string;
  reference: string;
  status: OrderStatus;
  totalUsd: number;
  heldUsd: number;
  expectedUsd: number;
};

/**
 * Deals whose ledger disagrees with the deal, in both modes.
 *
 * Should always be empty. A running deal holds what it has paid in
 * (`requiredHold`); an ended one holds nothing — a completed deal has paid
 * the seller and booked its fee, and a refunded, cancelled or returned one
 * has handed the rest back. Completion and refunds refuse to move money on a
 * deal that fails this, so this list is where such a deal surfaces.
 */
export async function holdMismatches(): Promise<HoldMismatch[]> {
  const holding = await db.ledgerEntry.groupBy({
    by: ["orderId"],
    where: HELD_FOR_BUYERS,
    _sum: { amountUsd: true },
    having: { amountUsd: { _sum: { not: 0 } } },
  });
  const held = new Map<string, number>();
  for (const row of holding) {
    if (row.orderId) held.set(row.orderId, row._sum.amountUsd ?? 0);
  }

  const orders = await db.order.findMany({
    where: {
      OR: [
        // Holding something: is it the right amount, and should it be?
        { id: { in: [...held.keys()] } },
        // Paid and running, so it should be holding something.
        {
          paymentRef: { not: null },
          status: { notIn: [...TERMINAL_STATUSES] },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      reference: true,
      status: true,
      mode: true,
      totalUsd: true,
      buyerFeeUsd: true,
      priceUsd: true,
      paymentRef: true,
      buyerPaidAt: true,
    },
  });

  return orders.flatMap((order) => {
    const heldUsd = held.get(order.id) ?? 0;
    const expectedUsd = isTerminal(order.status) ? 0 : requiredHold(order);
    return heldUsd === expectedUsd
      ? []
      : [
          {
            id: order.id,
            reference: order.reference,
            status: order.status,
            totalUsd: order.totalUsd,
            heldUsd,
            expectedUsd,
          },
        ];
  });
}

// ---------------------------------------------------------------- invoices

/**
 * Processor statuses that leave an invoice needing a person even though it
 * never settled: an underpayment, and an AML hold.
 */
const NEEDS_A_LOOK = ["wrong_amount", "locked"];

export type InvoiceProblem =
  | "settled-not-applied"
  | "wrong-amount"
  | "held-for-review";

export type InvoiceAttention = {
  id: string;
  reference: string;
  purpose: InvoicePurpose;
  /** What the invoice asked for, in cents. */
  amountUsd: number;
  lastStatus: string | null;
  externalId: string | null;
  createdAt: Date;
  settledAt: Date | null;
  user: { id: string; name: string; email: string };
  order: {
    id: string;
    reference: string;
    status: OrderStatus;
    mode: DealMode;
    totalUsd: number;
    paymentRef: string | null;
    buyerPaymentRef: string | null;
  } | null;
  problem: InvoiceProblem;
  /**
   * Whether the money did land and only the invoice's own mark is missing:
   * on the deal, in the payer's balance, or nowhere yet.
   */
  landed: "deal" | "balance" | null;
};

/**
 * Invoices a human has to look at.
 *
 * Paid at the processor and never applied, which is exactly the buyer who
 * paid and whose deal still says unpaid — plus the two statuses that never
 * settle but are not dead either. Oldest first, like every other queue.
 */
export async function listInvoicesNeedingAttention(
  limit = 50,
): Promise<{ rows: InvoiceAttention[]; total: number }> {
  const where: Prisma.InvoiceWhereInput = {
    appliedAt: null,
    OR: [{ settledAt: { not: null } }, { lastStatus: { in: NEEDS_A_LOOK } }],
  };

  const [invoices, total] = await Promise.all([
    db.invoice.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: limit,
      select: {
        id: true,
        reference: true,
        purpose: true,
        amountUsd: true,
        lastStatus: true,
        externalId: true,
        createdAt: true,
        settledAt: true,
        user: { select: { id: true, name: true, email: true } },
        order: {
          select: {
            id: true,
            reference: true,
            status: true,
            mode: true,
            totalUsd: true,
            paymentRef: true,
            buyerPaymentRef: true,
          },
        },
      },
    }),
    db.invoice.count({ where }),
  ]);

  // The handles the money is claimed under once it lands. `deposit:` is
  // what `creditDeposit` writes for a top-up; `late:` and `overpay:` are
  // what the deal code writes for a payment it could not use.
  const handles = invoices.flatMap((inv) => [
    `deposit:${inv.reference}`,
    `late:${inv.reference}`,
    `overpay:${inv.reference}`,
  ]);
  const credited = new Set(
    handles.length > 0
      ? (
          await db.ledgerEntry.findMany({
            where: { externalRef: { in: handles } },
            select: { externalRef: true },
          })
        ).map((row) => row.externalRef)
      : [],
  );

  const rows = invoices.map((inv): InvoiceAttention => {
    const problem: InvoiceProblem = inv.settledAt
      ? "settled-not-applied"
      : inv.lastStatus === "wrong_amount"
        ? "wrong-amount"
        : "held-for-review";

    // A Safest deal takes two payments; the price is named on its own field.
    const onDeal =
      inv.order !== null &&
      (inv.order.paymentRef === inv.reference ||
        inv.order.buyerPaymentRef === inv.reference);
    const inBalance =
      credited.has(`deposit:${inv.reference}`) ||
      credited.has(`late:${inv.reference}`) ||
      credited.has(`overpay:${inv.reference}`);

    return {
      ...inv,
      problem,
      landed: onDeal ? "deal" : inBalance ? "balance" : null,
    };
  });

  return { rows, total };
}

export type InvoiceSummary = {
  reference: string;
  lastStatus: string | null;
  externalId: string | null;
  createdAt: Date;
  updatedAt: Date;
  settledAt: Date | null;
  appliedAt: Date | null;
};

/** The newest invoice raised for each of these deals. */
export async function latestInvoicesFor(
  orderIds: readonly string[],
): Promise<Map<string, InvoiceSummary>> {
  if (orderIds.length === 0) return new Map();

  const invoices = await db.invoice.findMany({
    where: { orderId: { in: [...orderIds] } },
    orderBy: { createdAt: "desc" },
    select: {
      orderId: true,
      reference: true,
      lastStatus: true,
      externalId: true,
      createdAt: true,
      updatedAt: true,
      settledAt: true,
      appliedAt: true,
    },
  });

  const latest = new Map<string, InvoiceSummary>();
  for (const { orderId, ...invoice } of invoices) {
    if (orderId && !latest.has(orderId)) latest.set(orderId, invoice);
  }
  return latest;
}

export type InvoiceTone =
  | "neutral"
  | "primary"
  | "verified"
  | "danger"
  | "info";

export type InvoiceLine = { label: string; note: string; tone: InvoiceTone };

const IN_FLIGHT = new Set(["process", "confirm_check", "check"]);
const FAILED = new Set(["fail", "cancel", "system_fail"]);
const REFUNDING = new Set(["refund_process", "refund_paid", "refund_fail"]);

/**
 * What the processor has told us about a deal's payment, in a sentence.
 *
 * Shown next to the "record a payment by hand" control, because that is an
 * irreversible step and finance was being asked to take it blind. The one
 * that matters most is a settled invoice that was never applied: the buyer
 * has paid, and the deal does not know.
 */
export function describeInvoice(
  invoice: Pick<
    InvoiceSummary,
    "lastStatus" | "settledAt" | "appliedAt"
  > | null,
  { checkoutOn = true }: { checkoutOn?: boolean } = {},
): InvoiceLine {
  if (!invoice && !checkoutOn) {
    // Not the buyer's doing: with no processor there is no invoice to raise,
    // and saying they "had not opened the payment page" blamed them for it.
    return {
      label: "Checkout is switched off",
      note: "Card and crypto checkout is not switched on, so no invoice can exist. A payment that reached us some other way is recorded here by hand.",
      tone: "neutral",
    };
  }
  if (!invoice) {
    return {
      label: "No invoice raised",
      note: "The buyer has not opened the payment page, so there is nothing at the processor to check.",
      tone: "neutral",
    };
  }
  if (invoice.settledAt && !invoice.appliedAt) {
    return {
      label: "Paid at the processor, not applied",
      note: "The processor says this was paid, but the money never reached the deal. Check the amount at the processor before you record it below.",
      tone: "danger",
    };
  }
  if (invoice.settledAt) {
    return {
      label: "Paid and applied",
      note: "The processor confirmed it and it was applied. If the deal still says unpaid, reload the page.",
      tone: "verified",
    };
  }

  const status = invoice.lastStatus;
  if (!status) {
    return {
      label: "Invoice raised, nothing heard yet",
      note: "The buyer opened the payment page. The processor has not reported a payment.",
      tone: "neutral",
    };
  }
  if (status === "wrong_amount") {
    return {
      label: "Paid the wrong amount",
      note: "The buyer sent less than the total. Do not record it as paid; ask them to pay the difference.",
      tone: "danger",
    };
  }
  if (status === "wrong_amount_waiting") {
    return {
      label: "Paid short, waiting for the rest",
      note: "The processor is waiting for the buyer to send the difference. Do not record it yet.",
      tone: "primary",
    };
  }
  if (status === "locked") {
    return {
      label: "Held by the processor",
      note: "The processor is holding this payment for a compliance check. Wait for it to clear.",
      tone: "primary",
    };
  }
  if (IN_FLIGHT.has(status)) {
    return {
      label: "Payment on its way",
      note: "Seen on the network and waiting for confirmations. Do not record it by hand.",
      tone: "info",
    };
  }
  if (FAILED.has(status)) {
    return {
      label: "Invoice failed or expired",
      note: "No money arrived on this invoice. The buyer can open a new one from the deal.",
      tone: "neutral",
    };
  }
  if (REFUNDING.has(status)) {
    return {
      label: "Refunded by the processor",
      note: "The processor sent this payment back to the buyer.",
      tone: "info",
    };
  }
  return {
    label: `Processor says “${status}”`,
    note: "Not a status this desk recognises. Check it at the processor.",
    tone: "neutral",
  };
}

// ------------------------------------------------------------- deal lookup

const LOOKUP_SELECT = {
  id: true,
  reference: true,
  mode: true,
  status: true,
  priceUsd: true,
  totalUsd: true,
  createdAt: true,
  completedAt: true,
  cancelledAt: true,
  listing: { select: { title: true, handle: true } },
  buyer: { select: { name: true, email: true } },
  seller: { select: { name: true, email: true } },
} satisfies Prisma.OrderSelect;

type LookupRecord = Prisma.OrderGetPayload<{ select: typeof LOOKUP_SELECT }>;

export type DealLookupRow = {
  id: string;
  reference: string;
  mode: DealMode;
  status: OrderStatus;
  priceUsd: number;
  totalUsd: number;
  createdAt: Date;
  /** When it completed or stopped, or null while it is running. */
  endedAt: Date | null;
  listingTitle: string;
  listingHandle: string;
  buyerName: string;
  buyerEmail: string;
  sellerName: string;
  sellerEmail: string;
};

function toLookupRow(order: LookupRecord): DealLookupRow {
  return {
    id: order.id,
    reference: order.reference,
    mode: order.mode,
    status: order.status,
    priceUsd: order.priceUsd,
    totalUsd: order.totalUsd,
    createdAt: order.createdAt,
    endedAt: order.completedAt ?? order.cancelledAt ?? null,
    listingTitle: order.listing.title,
    listingHandle: order.listing.handle,
    buyerName: order.buyer.name,
    buyerEmail: order.buyer.email,
    sellerName: order.seller.name,
    sellerEmail: order.seller.email,
  };
}

/**
 * A deal reference, however a customer wrote it.
 *
 * "CA-48213", "ca48213", "#48213", "CA 48213" and a bare "48213" are all the
 * same deal. References are generated as `CA-` and five digits, so anything
 * else is not one and is searched as free text instead.
 */
export function referenceFrom(query: string): string | null {
  const compact = query.trim().toUpperCase().replace(/[\s#]/g, "");
  const match = /^(?:CA-?)?(\d{5})$/.exec(compact);
  return match ? `CA-${match[1]}` : null;
}

export type DealSearch = {
  /** Set when the query was a reference that exists. */
  exact: DealLookupRow | null;
  rows: DealLookupRow[];
  total: number;
};

/**
 * Finding a deal from what the customer gave us.
 *
 * A reference is looked up exactly. Anything else is matched, case
 * insensitively, against the reference, the listing's handle, title and
 * slug, and both parties' email addresses — the three things a customer
 * writing in is likely to quote. Every status, finished or not: the deal
 * they are writing about is usually one that ended.
 */
export async function searchDeals(
  query: string,
  limit = 25,
): Promise<DealSearch> {
  const q = query.trim().slice(0, 120);
  if (q.length < 2) return { exact: null, rows: [], total: 0 };

  const reference = referenceFrom(q);
  if (reference) {
    const order = await db.order.findUnique({
      where: { reference },
      select: LOOKUP_SELECT,
    });
    if (order) {
      const row = toLookupRow(order);
      return { exact: row, rows: [row], total: 1 };
    }
  }

  // Handles are stored with their "@"; a customer may or may not type it.
  const term = q.replace(/^@/, "");
  const text = { contains: term, mode: "insensitive" as const };
  const where: Prisma.OrderWhereInput = {
    OR: [
      { reference: text },
      { listing: { is: { handle: text } } },
      { listing: { is: { title: text } } },
      { listing: { is: { slug: text } } },
      { buyer: { is: { email: text } } },
      { seller: { is: { email: text } } },
    ],
  };

  const [orders, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: LOOKUP_SELECT,
    }),
    db.order.count({ where }),
  ]);

  return { exact: null, rows: orders.map(toLookupRow), total };
}

export const FINISHED_STATUSES: readonly OrderStatus[] = TERMINAL_STATUSES;

export type FinishedDeals = {
  rows: DealLookupRow[];
  total: number;
  page: number;
  pages: number;
  /** How many deals ended each way, for the filter strip. */
  counts: Partial<Record<OrderStatus, number>>;
};

/**
 * Deals that have stopped, most recently touched first.
 *
 * The desk used to list only live statuses, so a completed, refunded,
 * cancelled or lapsed deal could be reached only by its id — which no
 * customer has.
 */
export async function listFinishedDeals(input: {
  status?: OrderStatus | null;
  page?: number;
  perPage?: number;
}): Promise<FinishedDeals> {
  const perPage = input.perPage ?? 25;
  const status =
    input.status && FINISHED_STATUSES.includes(input.status)
      ? input.status
      : null;
  const where: Prisma.OrderWhereInput = status
    ? { status }
    : { status: { in: [...FINISHED_STATUSES] } };

  const [grouped, total] = await Promise.all([
    db.order.groupBy({
      by: ["status"],
      where: { status: { in: [...FINISHED_STATUSES] } },
      _count: { _all: true },
    }),
    db.order.count({ where }),
  ]);

  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, Math.floor(input.page ?? 1)), pages);

  const orders = await db.order.findMany({
    where,
    // A terminal order is not written to again, so this is when it ended.
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * perPage,
    take: perPage,
    select: LOOKUP_SELECT,
  });

  const counts: Partial<Record<OrderStatus, number>> = {};
  for (const row of grouped) counts[row.status] = row._count._all;

  return { rows: orders.map(toLookupRow), total, page, pages, counts };
}

// ---------------------------------------------------------------- exports

/** A cell that is a number, so it must not be quoted or defused. */
export type NumericCell = { numeric: string };
export type CsvCell = string | number | null | undefined | NumericCell;

/**
 * Integer cents as a decimal string, without ever going through a float:
 * -1234 is "-12.34", 5 is "0.05".
 */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function money(cents: number): NumericCell {
  return { numeric: centsToDecimal(cents) };
}

/** "2026-10-17 09:12:03", which a spreadsheet reads as a date. UTC. */
function utc(date: Date | null): string {
  return date ? date.toISOString().replace("T", " ").slice(0, 19) : "";
}

/**
 * One CSV field.
 *
 * Text that begins with `=`, `+`, `-`, `@` or a control character is a
 * formula to a spreadsheet, and member names, payout notes and addresses
 * are typed by people we do not control. Those get a leading apostrophe so
 * an accountant opening the file runs nothing. Numbers are exempt — a
 * negative amount is not an attack.
 */
export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "object") return value.numeric;

  const defused = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(defused)
    ? `"${defused.replace(/"/g, '""')}"`
    : defused;
}

export function toCsv(header: readonly string[], rows: CsvCell[][]): string {
  const lines = [header.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  // CRLF and a byte-order mark: what Excel needs to open UTF-8 names right.
  return `﻿${lines.join("\r\n")}\r\n`;
}

const LEDGER_HEADER = [
  "entry_id",
  "created_at_utc",
  "kind",
  "side",
  "amount_usd",
  "amount_cents",
  "member_id",
  "member_name",
  "member_email",
  "deal_reference",
  "deal_mode",
  "note",
  "external_ref",
] as const;

/** Rows per round trip, so a busy month does not load in one query. */
const EXPORT_BATCH = 2_000;

/** Every ledger row written in the month, oldest first. Unguarded. */
async function ledgerCsv(month: Month): Promise<{ csv: string; rows: number }> {
  const out: CsvCell[][] = [];
  let cursor: string | undefined;

  for (;;) {
    const batch = await db.ledgerEntry.findMany({
      where: { createdAt: { gte: month.start, lt: month.end } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: EXPORT_BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        createdAt: true,
        kind: true,
        amountUsd: true,
        note: true,
        externalRef: true,
        userId: true,
        user: { select: { name: true, email: true } },
        order: { select: { reference: true, mode: true } },
      },
    });

    for (const entry of batch) {
      out.push([
        entry.id,
        utc(entry.createdAt),
        entry.kind,
        entry.userId ? "member" : "platform",
        money(entry.amountUsd),
        entry.amountUsd,
        entry.userId,
        entry.user?.name,
        entry.user?.email,
        entry.order?.reference,
        entry.order?.mode,
        entry.note,
        entry.externalRef,
      ]);
    }

    if (batch.length < EXPORT_BATCH) break;
    cursor = batch[batch.length - 1]?.id;
  }

  return { csv: toCsv(LEDGER_HEADER, out), rows: out.length };
}

const PAYOUTS_HEADER = [
  "withdrawal_id",
  "requested_at_utc",
  "sent_at_utc",
  "amount_usd",
  "amount_cents",
  "member_id",
  "member_name",
  "member_email",
  "network",
  "address",
  "tx_hash",
  "sent_by",
] as const;

/** Every payout marked as sent during the month, oldest first. Unguarded. */
async function payoutsCsv(
  month: Month,
): Promise<{ csv: string; rows: number }> {
  const sent = await db.withdrawal.findMany({
    where: {
      status: "SENT",
      settledAt: { gte: month.start, lt: month.end },
    },
    orderBy: [{ settledAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      requestedAt: true,
      settledAt: true,
      amountUsd: true,
      userId: true,
      network: true,
      address: true,
      txHash: true,
      reviewerId: true,
      user: { select: { name: true, email: true } },
    },
  });

  // `reviewerId` is a bare column, not a relation, so names are one lookup.
  const reviewerIds = [
    ...new Set(sent.flatMap((w) => (w.reviewerId ? [w.reviewerId] : []))),
  ];
  const reviewers = new Map(
    reviewerIds.length > 0
      ? (
          await db.user.findMany({
            where: { id: { in: reviewerIds } },
            select: { id: true, name: true },
          })
        ).map((u) => [u.id, u.name])
      : [],
  );

  const rows: CsvCell[][] = sent.map((w) => [
    w.id,
    utc(w.requestedAt),
    utc(w.settledAt),
    money(w.amountUsd),
    w.amountUsd,
    w.userId,
    w.user.name,
    w.user.email,
    w.network,
    w.address,
    w.txHash,
    w.reviewerId ? (reviewers.get(w.reviewerId) ?? w.reviewerId) : null,
  ]);

  return { csv: toCsv(PAYOUTS_HEADER, rows), rows: rows.length };
}

// ------------------------------------------------------------------ access

/**
 * Finance or a superadmin, and not suspended — read from the database, not
 * from the session.
 *
 * The export routes check `requireRole("FINANCE")` before they get here.
 * This is the second check, the way `settleWithdrawal` re-reads its caller:
 * a file holding every member's email and every payout address must not
 * depend on one guard in one route file staying put.
 */
async function isFinanceDesk(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, bannedAt: true },
  });
  return (
    !!user &&
    !user.bannedAt &&
    (user.role === "FINANCE" || user.role === "SUPERADMIN")
  );
}

export type CsvExport =
  | { ok: true; csv: string; rows: number; filename: string }
  | { ok: false };

export async function exportLedger(
  month: Month,
  byUserId: string,
): Promise<CsvExport> {
  if (!(await isFinanceDesk(byUserId))) return { ok: false };
  const { csv, rows } = await ledgerCsv(month);
  return {
    ok: true,
    csv,
    rows,
    filename: `channel-adda-ledger-${month.key}.csv`,
  };
}

export async function exportPayouts(
  month: Month,
  byUserId: string,
): Promise<CsvExport> {
  if (!(await isFinanceDesk(byUserId))) return { ok: false };
  const { csv, rows } = await payoutsCsv(month);
  return {
    ok: true,
    csv,
    rows,
    filename: `channel-adda-payouts-${month.key}.csv`,
  };
}
