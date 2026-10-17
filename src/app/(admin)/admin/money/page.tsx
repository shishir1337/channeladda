import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BanknoteIcon,
  CoinsIcon,
  LandmarkIcon,
  LockIcon,
  PiggyBankIcon,
  ReceiptIcon,
  RotateCcwIcon,
  ScaleIcon,
  SlidersHorizontalIcon,
  WalletIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AllClear,
  Amount,
  ConsoleHeader,
  ConsoleSection,
  MetaItem,
  MetricGrid,
  Panel,
  RowHead,
  RowItem,
  Rows,
  TableScroller,
  Td,
  Th,
} from "@/components/admin/console";
import {
  DownloadLink,
  exactUsd,
  MoneyMetric,
  MonthPicker,
  plural,
} from "@/components/admin/money-parts";
import {
  DealModeBadge,
  OrderStatusBadge,
  Waited,
} from "@/components/admin/vocab";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import {
  fastestHoldMismatches,
  type InvoiceAttention,
  listInvoicesNeedingAttention,
  moneyPosition,
  monthFigures,
  monthOf,
  parseMonth,
  recentMonths,
  shiftMonth,
} from "@/server/admin-money";
import { requireRole } from "@/server/session";

export const metadata: Metadata = {
  title: "Money",
  robots: { index: false, follow: false },
};

/**
 * What a processor problem is called on the row.
 *
 * Three kinds of invoice end up here, and they need opposite responses —
 * one is waiting for a person to apply it, one must never be applied as it
 * stands, and one is waiting on the processor.
 */
const PROBLEM: Record<
  InvoiceAttention["problem"],
  { label: string; variant: "danger" | "primary" }
> = {
  "settled-not-applied": { label: "Paid, not applied", variant: "danger" },
  "wrong-amount": { label: "Wrong amount paid", variant: "danger" },
  "held-for-review": { label: "Held by the processor", variant: "primary" },
};

/** What to do about one invoice, in a sentence somebody can act on. */
function invoiceAdvice(row: InvoiceAttention): string {
  if (row.problem === "wrong-amount") {
    return "The buyer sent the wrong amount. Do not record it as paid — ask them to pay the difference, or refund it from the processor's dashboard.";
  }
  if (row.problem === "held-for-review") {
    return "The processor is holding this for a compliance check. There is nothing to do here until it clears.";
  }
  if (row.landed === "deal") {
    return "Already applied to the deal — only the invoice's own mark is missing. The sweep clears it on its next run. Nothing to do.";
  }
  if (row.landed === "balance") {
    return "Already credited to the member's balance. The sweep clears it on its next run. Nothing to do.";
  }
  if (row.purpose === "TOPUP") {
    return "Not credited yet. The sweep retries it every ten minutes; if it is still here after that, check the payment in the processor's dashboard and look at the sweep on the staff overview. Do not use a balance correction for this — it would book the money as coming from us rather than as their deposit.";
  }
  if (!row.order) {
    return "The deal this was raised for no longer exists. Check the payment in the processor's dashboard.";
  }
  if (row.order.status === "AWAITING_PAYMENT") {
    return "The deal still says unpaid. Check the amount in the processor's dashboard; if the full amount arrived, record it on the deal desk under “Waiting on payment”. That cannot be undone.";
  }
  return "The deal has already moved on, so the sweep credits this payment to the buyer's balance on its own. If it is still here after the next run, check the sweep on the staff overview.";
}

/**
 * The money desk.
 *
 * FINANCE and SUPERADMIN only — the same gate as `/admin/payouts`.
 *
 * Written for an owner reading it, not an engineer: every figure says in
 * one line what it counts, revenue is only ever fees, and the order is the
 * order somebody should act in — what needs a person, then where the money
 * is right now, then the month's report and its exports.
 */
export default async function AdminMoneyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireRole("FINANCE");
  const params = await searchParams;

  const now = new Date();
  const month = parseMonth(
    typeof params.month === "string" ? params.month : undefined,
    now,
  );
  const thisMonth = monthOf(now);
  const isCurrent = month.key === thisMonth.key;
  const later = month.start >= thisMonth.end;

  const [figures, position, mismatches, invoices] = await Promise.all([
    monthFigures(month, now),
    moneyPosition(),
    fastestHoldMismatches(),
    listInvoicesNeedingAttention(),
  ]);

  const fees = figures.fees;
  const feeRows = [
    {
      mode: "SAFEST" as const,
      buyer: fees.safest.buyer,
      seller: fees.safest.seller,
    },
    {
      mode: "FASTEST" as const,
      buyer: fees.fastest.buyer,
      seller: fees.fastest.seller,
    },
  ];
  const grossFees = feeRows.reduce(
    (sum, row) => sum + row.buyer.cents + row.seller.cents,
    0,
  );
  const unapplied = invoices.rows.filter((row) => row.landed === null);

  return (
    <>
      <ConsoleHeader
        eyebrow="Money"
        title="Money desk"
        description="What Channel Adda earned, what it is holding for other people, and what it paid out — month by month, straight from the ledger. Revenue here is fees and nothing else: on a Safest deal the price goes buyer to seller and never touches our books, and on a Fastest deal the price is the seller's money, which we only hold."
        actions={
          <Button asChild size="sm" variant="secondary">
            <Link href="/admin/money/adjust">
              <SlidersHorizontalIcon aria-hidden="true" className="size-4" />
              Correct a balance
            </Link>
          </Button>
        }
        meta={
          <>
            <MetaItem label="Signed in as">{staff.name}</MetaItem>
            <MetaItem label="Desk">
              {staff.role.toLowerCase().replace("_", " ")}
            </MetaItem>
            <MetaItem label="Read">{now.toLocaleString("en-GB")}</MetaItem>
          </>
        }
      />

      {/* --------------------------------------------- needs a person */}
      <ConsoleSection
        id="invoices"
        title="Paid at the processor, not applied"
        count={invoices.total}
        tone={unapplied.length > 0 ? "danger" : "neutral"}
        description="The processor told us these were paid, but the money never reached a deal or a balance — or it arrived in a state a person has to judge. The sweep retries every ten minutes, so anything here for longer than that needs you. Check each one in the processor's dashboard by its reference before acting: recording a payment by hand cannot be undone."
      >
        {invoices.rows.length === 0 ? (
          <AllClear
            title="Every paid invoice reached its deal or balance"
            body="When a buyer pays and the deal still says unpaid, the invoice shows up here first."
          />
        ) : (
          <Rows>
            {invoices.rows.map((row) => {
              const problem = PROBLEM[row.problem];
              return (
                <RowItem
                  key={row.id}
                  flag={row.landed === null ? "danger" : undefined}
                >
                  <div className="p-4 pl-5">
                    <RowHead
                      title={
                        <span className="font-mono text-[0.8125rem] break-all">
                          {row.reference}
                        </span>
                      }
                      reference={
                        row.purpose === "DEAL"
                          ? "Deal payment"
                          : "Wallet top-up"
                      }
                      tags={
                        <>
                          <Badge variant={problem.variant}>
                            {problem.label}
                          </Badge>
                          {row.landed ? (
                            <Badge variant="verified">Money landed</Badge>
                          ) : null}
                          {row.order ? (
                            <>
                              <DealModeBadge mode={row.order.mode} />
                              <OrderStatusBadge status={row.order.status} />
                            </>
                          ) : null}
                          {row.settledAt ? (
                            <Waited
                              since={row.settledAt}
                              prefix="paid"
                              warnAfter={0.25}
                              lateAfter={1}
                            />
                          ) : (
                            <Waited since={row.createdAt} prefix="raised" />
                          )}
                        </>
                      }
                      right={
                        <Amount cents={row.amountUsd} caption="invoiced" />
                      }
                    />
                    <p className="mt-2 text-xs text-muted">
                      <Link
                        href={`/admin/users/${row.user.id}`}
                        className="font-medium text-primary-text underline-offset-4 hover:underline"
                      >
                        {row.user.name}
                      </Link>
                      <span className="text-subtle"> · </span>
                      <span className="break-all">{row.user.email}</span>
                      {row.order ? (
                        <>
                          <span className="text-subtle"> · deal </span>
                          <Link
                            href={`/dashboard/deals/${row.order.id}`}
                            className="tnum font-medium text-primary-text underline-offset-4 hover:underline"
                          >
                            {row.order.reference}
                          </Link>
                          <span className="text-subtle">
                            {" "}
                            owes{" "}
                            <span className="tnum">
                              {exactUsd(row.order.totalUsd)}
                            </span>
                          </span>
                        </>
                      ) : null}
                    </p>
                    <p className="mt-2 max-w-[78ch] text-sm leading-relaxed text-fg">
                      {invoiceAdvice(row)}
                    </p>
                    <p className="mt-1.5 text-[0.6875rem] break-all text-subtle">
                      Processor status: {row.lastStatus ?? "none yet"}
                      {row.externalId
                        ? ` · processor id ${row.externalId}`
                        : ""}
                    </p>
                  </div>
                </RowItem>
              );
            })}
          </Rows>
        )}
        {invoices.total > invoices.rows.length ? (
          <p className="mt-2.5 text-xs text-subtle">
            Showing the oldest {invoices.rows.length} of{" "}
            {invoices.total.toLocaleString("en-US")}. Work these and the rest
            move up.
          </p>
        ) : null}
      </ConsoleSection>

      {/* ------------------------------------------------ right now */}
      <ConsoleSection
        id="now"
        title="Right now"
        description="Where the money is at this moment, whatever month is selected below. Everything here is worked out from the ledger rows, not from what the deals say should have happened."
      >
        <MetricGrid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <MoneyMetric
            label="Held for Fastest buyers"
            cents={position.heldForBuyers.cents}
            count={plural(position.heldForBuyers.count, "deal")}
            icon={LockIcon}
            tone={position.heldForBuyers.cents > 0 ? "info" : "neutral"}
            note="Price plus fee on Fastest deals still running, including those waiting out their recovery hold. Not ours: it becomes the seller's when the deal completes, or goes back to the buyer on a refund."
          />
          <MoneyMetric
            label="In members' wallets"
            cents={position.memberBalances.cents}
            count={plural(position.memberBalances.count, "member")}
            icon={WalletIcon}
            note="Every member balance added together — money we owe members, which they can spend on a deal or withdraw."
          />
          <MoneyMetric
            label="Payouts waiting"
            cents={position.pendingPayouts.cents}
            count={plural(position.pendingPayouts.count, "request")}
            icon={CoinsIcon}
            href="/admin/payouts"
            tone={position.pendingPayouts.count > 0 ? "primary" : "neutral"}
            note="Asked for and not sent yet. Already counted inside members' wallets — it is the part of their money they have asked to take out."
          />
          <MoneyMetric
            label="Ours"
            cents={position.platformOwn}
            icon={PiggyBankIcon}
            tone="verified"
            note="Every fee earned since the start, less fees given back and balance corrections we paid for. The only part of the money here that belongs to Channel Adda."
          />
          <MoneyMetric
            label="Should be on hand"
            cents={position.onHand}
            icon={LandmarkIcon}
            note="The three above added up: what our crypto accounts should hold, before processor and network fees. If they hold much less, stop and find out why."
          />
        </MetricGrid>

        <div className="mt-3">
          {mismatches.length === 0 ? (
            <AllClear
              icon={ScaleIcon}
              title="The books agree with every Fastest deal"
              body="Each running Fastest deal has exactly its price plus fee on our books, and each finished one has nothing left. Checked every time this page loads."
            />
          ) : (
            <Panel tone="danger">
              <p className="flex items-center gap-2 font-display text-sm font-bold text-fg">
                <ScaleIcon aria-hidden="true" className="size-4 text-danger" />
                {plural(mismatches.length, "Fastest deal")} where the books and
                the deal disagree
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                The money on our books for these deals is not what the deal says
                we should be holding. This should never happen. Do not refund,
                release or correct anything on them until a developer has
                looked.
              </p>
              <TableScroller className="mt-3">
                <table className="w-full min-w-[30rem] text-sm">
                  <caption className="sr-only">
                    Fastest deals whose ledger does not match their status
                  </caption>
                  <thead>
                    <tr>
                      <Th>Deal</Th>
                      <Th>Status</Th>
                      <Th numeric>On our books</Th>
                      <Th numeric>Should be</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {mismatches.map((row) => (
                      <tr key={row.id} className="border-t border-line">
                        <Td>
                          <Link
                            href={`/dashboard/deals/${row.id}`}
                            className="tnum text-xs text-primary-text underline-offset-4 hover:underline"
                          >
                            {row.reference}
                          </Link>
                        </Td>
                        <Td>
                          <OrderStatusBadge status={row.status} />
                        </Td>
                        <Td numeric>{exactUsd(row.heldUsd)}</Td>
                        <Td numeric>{exactUsd(row.expectedUsd)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroller>
            </Panel>
          )}
        </div>
      </ConsoleSection>

      {/* ------------------------------------------------- the month */}
      <section
        id="month"
        aria-labelledby="month-heading"
        className="mt-10 border-t border-line pt-6"
      >
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <p className="font-mono text-[0.625rem] font-semibold tracking-[0.14em] text-subtle uppercase">
              Monthly report
            </p>
            <h2
              id="month-heading"
              className="mt-1.5 font-display text-[1.35rem] leading-tight font-black tracking-tight text-fg"
            >
              {month.label}
              {isCurrent ? (
                <span className="ml-2 align-middle text-xs font-semibold text-subtle">
                  so far
                </span>
              ) : null}
            </h2>
            <p className="mt-1.5 max-w-[68ch] text-sm leading-relaxed text-muted">
              Months run from midnight to midnight UTC.
              {later
                ? " This month has not started yet, so everything below is empty."
                : isCurrent
                  ? " This month is not over, so these figures will still grow."
                  : ""}
            </p>
          </div>
          <MonthPicker
            action="/admin/money"
            current={month}
            options={recentMonths(24, now)}
            previous={shiftMonth(month, -1)}
            next={month.start < thisMonth.start ? shiftMonth(month, 1) : null}
          />
        </div>

        <ConsoleSection
          id="fees"
          title="Fees earned"
          description="Our revenue for the month. A Safest fee is earned when the buyer's opening payment clears; a Fastest fee only when the deal completes, because until then it is part of the money we hold."
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,18rem)_1fr]">
            <Panel tone={fees.net > 0 ? "verified" : "neutral"}>
              <p className="flex items-center gap-1.5 font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase">
                <ReceiptIcon aria-hidden="true" className="size-3.5" />
                Net fees earned
              </p>
              <p className="mt-2.5 font-display text-[2rem] leading-none font-black text-fg">
                <Price usd={fees.net / 100} />
              </p>
              <p className="tnum mt-2 text-xs text-muted">
                {exactUsd(fees.net)}
              </p>
              <p className="mt-2 text-[0.6875rem] leading-snug text-subtle">
                Every fee in the table, less Safest fees given back. This is the
                month&rsquo;s revenue. Channel prices are never revenue.
              </p>
            </Panel>

            <TableScroller>
              <table className="w-full min-w-[32rem] text-sm">
                <caption className="sr-only">
                  Fees earned in {month.label}, by deal mode
                </caption>
                <thead>
                  <tr>
                    <Th>Mode</Th>
                    <Th numeric>Buyer fee</Th>
                    <Th numeric>Seller fee</Th>
                    <Th numeric>Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {feeRows.map((row) => (
                    <tr key={row.mode} className="border-t border-line">
                      <Td>
                        <DealModeBadge mode={row.mode} />
                        <span className="mt-1 block text-[0.6875rem] text-subtle">
                          {plural(row.buyer.count, "deal")}
                        </span>
                      </Td>
                      <Td numeric>
                        <Amount
                          cents={row.buyer.cents}
                          caption={exactUsd(row.buyer.cents)}
                        />
                      </Td>
                      <Td numeric>
                        {row.mode === "SAFEST" && row.seller.count === 0 ? (
                          <span className="text-xs text-subtle">
                            never charged
                          </span>
                        ) : (
                          <Amount
                            cents={row.seller.cents}
                            caption={exactUsd(row.seller.cents)}
                          />
                        )}
                      </Td>
                      <Td numeric>
                        <Amount
                          cents={row.buyer.cents + row.seller.cents}
                          caption={exactUsd(row.buyer.cents + row.seller.cents)}
                        />
                      </Td>
                    </tr>
                  ))}
                  <tr className="border-t border-line">
                    <Td className="text-xs text-muted">
                      Given back
                      <span className="mt-0.5 block text-[0.6875rem] text-subtle">
                        {plural(fees.returned.count, "Safest refund")}
                      </span>
                    </Td>
                    <Td numeric>{null}</Td>
                    <Td numeric>{null}</Td>
                    <Td numeric>
                      <Amount
                        cents={0 - fees.returned.cents}
                        caption={exactUsd(0 - fees.returned.cents)}
                        tone={fees.returned.cents > 0 ? "danger" : "neutral"}
                      />
                    </Td>
                  </tr>
                  <tr className="border-t border-line-strong bg-surface-2">
                    <Td className="font-semibold text-fg">Net</Td>
                    <Td numeric>{null}</Td>
                    <Td numeric>
                      <span className="text-[0.6875rem] text-subtle">
                        gross {exactUsd(grossFees)}
                      </span>
                    </Td>
                    <Td numeric>
                      <Amount cents={fees.net} caption={exactUsd(fees.net)} />
                    </Td>
                  </tr>
                </tbody>
              </table>
            </TableScroller>
          </div>

          <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs leading-relaxed text-muted sm:grid-cols-2">
            <div>
              <dt className="inline font-semibold text-fg">Safest buyer fee</dt>
              <dd className="inline">
                {" "}
                — the admin fee Safest buyers paid us, counted when their
                opening payment cleared.
              </dd>
            </div>
            <div>
              <dt className="inline font-semibold text-fg">
                Safest seller fee
              </dt>
              <dd className="inline">
                {" "}
                — there is none: the price goes buyer to seller, so there is
                nothing for us to deduct it from.
              </dd>
            </div>
            <div>
              <dt className="inline font-semibold text-fg">
                Fastest buyer fee
              </dt>
              <dd className="inline">
                {" "}
                — the fee on top of the price, from Fastest deals that completed
                this month.
              </dd>
            </div>
            <div>
              <dt className="inline font-semibold text-fg">
                Fastest seller fee
              </dt>
              <dd className="inline">
                {" "}
                — taken from the seller&rsquo;s price on Fastest deals that
                completed this month, at the seller-fee rate.
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="inline font-semibold text-fg">Given back</dt>
              <dd className="inline">
                {" "}
                — Safest admin fees refunded because the deal was cancelled
                before an agent took the channel. Fastest refunds are not here:
                they return money we were holding, not money we had earned.
              </dd>
            </div>
          </dl>
        </ConsoleSection>

        <ConsoleSection
          id="flows"
          title="Money that moved"
          description="Everything else that went in or out during the month. None of it is revenue; most of it is other people's money passing through."
        >
          <MetricGrid className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <MoneyMetric
              label="Paid into Fastest deals"
              cents={figures.fastest.paidIn.cents}
              count={plural(figures.fastest.paidIn.count, "deal")}
              icon={ArrowDownLeftIcon}
              note="Price plus fee from Fastest buyers, by crypto or from their balance. We hold it until the deal ends."
            />
            <MoneyMetric
              label="Credited to sellers"
              cents={figures.fastest.toSellers.cents}
              count={plural(figures.fastest.toSellers.count, "sale")}
              icon={BanknoteIcon}
              note="Sale prices released into sellers' wallets when Fastest deals completed, less the seller fee. Still with us until they withdraw it."
            />
            <MoneyMetric
              label="Refunded to buyers"
              cents={figures.refunds.total}
              count={plural(
                figures.refunds.fastest.count + figures.refunds.safest.count,
                "refund",
              )}
              icon={RotateCcwIcon}
              tone={figures.refunds.total > 0 ? "info" : "neutral"}
              note={
                <>
                  Returned to buyers&rsquo; Channel Adda balances:{" "}
                  {exactUsd(figures.refunds.fastest.cents)} of held Fastest
                  money, {exactUsd(figures.refunds.safest.cents)} of Safest
                  admin fees.
                </>
              }
            />
            <MoneyMetric
              label="Deposits"
              cents={figures.deposits.topUps.cents}
              count={plural(figures.deposits.topUps.count, "top-up")}
              icon={ArrowDownLeftIcon}
              note="Money members paid in to their own balance."
            />
            <MoneyMetric
              label="Deal payments to balances"
              cents={figures.deposits.dealPayments.cents}
              count={plural(figures.deposits.dealPayments.count, "payment")}
              icon={WalletIcon}
              tone={
                figures.deposits.dealPayments.count > 0 ? "primary" : "neutral"
              }
              note="Deal payments that arrived after the deal had stopped, or paid a deal twice. Credited to the payer's balance rather than lost."
            />
            <MoneyMetric
              label="Paid from balances"
              cents={figures.spentFromBalances.cents}
              count={plural(figures.spentFromBalances.count, "deal")}
              icon={WalletIcon}
              note="Members paying a deal's opening payment out of their balance instead of by crypto. Moves their money into our hold or our fees."
            />
            <MoneyMetric
              label="Payouts sent"
              cents={figures.payouts.cents}
              count={plural(figures.payouts.count, "payout")}
              icon={ArrowUpRightIcon}
              href="/admin/payouts"
              note="Withdrawals finance marked as sent. This is money that left us for members' own crypto wallets."
            />
            <MoneyMetric
              label="Corrections added"
              cents={figures.adjustments.credits.cents}
              count={plural(figures.adjustments.credits.count, "correction")}
              icon={SlidersHorizontalIcon}
              href="/admin/money/adjust"
              note="Added to members' balances by hand. Each one came out of our own money, so the books still balance."
            />
            <MoneyMetric
              label="Corrections taken"
              cents={figures.adjustments.debits.cents}
              count={plural(figures.adjustments.debits.count, "correction")}
              icon={SlidersHorizontalIcon}
              href="/admin/money/adjust"
              note="Taken from members' balances by hand, usually a credit made by mistake. Each one went back into our own money."
            />
          </MetricGrid>
        </ConsoleSection>

        <ConsoleSection
          id="closing"
          title={
            isCurrent || later ? "Position so far" : "At the close of the month"
          }
          description={
            isCurrent || later
              ? "The month has not closed, so these match right now."
              : `What we were holding for other people at midnight UTC on ${figures.closing.asOf.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })} — the figures an accountant carries into the next month.`
          }
        >
          <MetricGrid className="grid-cols-1 sm:grid-cols-2">
            <MoneyMetric
              label="Held for Fastest buyers"
              cents={figures.closing.heldForBuyers}
              icon={LockIcon}
              note="Price plus fee on Fastest deals that were still running when the month closed."
            />
            <MoneyMetric
              label="In members' wallets"
              cents={figures.closing.memberBalances}
              icon={WalletIcon}
              note="Every member balance added together when the month closed: what we owed members."
            />
          </MetricGrid>
        </ConsoleSection>

        <ConsoleSection
          id="exports"
          title="For the accountant"
          description={`Spreadsheet files for ${month.label}, in exact US dollars and cents. Each download is written to the audit trail under your name.`}
        >
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Panel className="flex flex-col gap-3">
              <div>
                <p className="font-display text-sm font-bold text-fg">
                  Ledger entries
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Every row written this month: when, what kind, whose side (a
                  member&rsquo;s or ours), the amount, the deal and the note.
                  The platform&rsquo;s rows have no member.
                </p>
              </div>
              <div>
                <DownloadLink
                  href={`/api/admin/export/ledger?month=${month.key}`}
                >
                  Ledger CSV
                </DownloadLink>
              </div>
            </Panel>
            <Panel className="flex flex-col gap-3">
              <div>
                <p className="font-display text-sm font-bold text-fg">
                  Payouts sent
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Every withdrawal marked as sent this month, with the member,
                  the address, the network, the transaction hash and who sent
                  it.
                </p>
              </div>
              <div>
                <DownloadLink
                  href={`/api/admin/export/payouts?month=${month.key}`}
                >
                  Payouts CSV
                </DownloadLink>
              </div>
            </Panel>
          </div>
        </ConsoleSection>
      </section>

      <p className="mt-7 flex items-start gap-2 text-xs leading-relaxed text-subtle">
        <LockIcon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
        <span>
          Large figures are shown in whichever currency the header is set to,
          rounded to whole units; the exact US-dollar amount is under each one,
          and the downloads carry it to the cent. Every figure is a sum of
          ledger rows — the record each payout, refund and correction writes as
          it happens — so a deal&rsquo;s status never changes a past month.
        </span>
      </p>
    </>
  );
}
