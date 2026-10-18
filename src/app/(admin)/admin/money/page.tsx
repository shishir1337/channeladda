import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BanknoteIcon,
  CoinsIcon,
  FileSpreadsheetIcon,
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
  DownloadLink,
  exactUsd,
  linkClass,
  MoneyLine,
  MoneyMetric,
  MonthPicker,
  plural,
  RefLink,
} from "@/components/admin/money-parts";
import {
  DealModeBadge,
  OrderStatusBadge,
  Waited,
} from "@/components/admin/vocab";
import {
  AllClear,
  Amount,
  Callout,
  IconTile,
  List,
  ListItem,
  MetaItem,
  PageHeader,
  Section,
  Sep,
  StatGrid,
  TableCard,
  Td,
  Th,
  Tr,
} from "@/components/app/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
 *
 * The exports stay at the foot of the month's report rather than in the
 * page header: each file is for the month picked there, and a download
 * button at the top of the page would not say which month it fetches.
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
      <PageHeader
        title="Money desk"
        description="What Channel Adda earned, what it is holding for other people, and what it paid out — month by month, straight from the ledger."
        actions={
          <Button asChild variant="secondary">
            <Link href="/admin/money/adjust">
              <SlidersHorizontalIcon aria-hidden="true" />
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
      <Section
        id="invoices"
        title="Paid at the processor, not applied"
        count={invoices.total}
        tone={unapplied.length > 0 ? "danger" : "neutral"}
        description="The sweep retries every ten minutes, so anything here for longer than that needs you. Check each one in the processor's dashboard by its reference before acting: recording a payment by hand cannot be undone."
      >
        {invoices.rows.length === 0 ? (
          <AllClear
            title="Every paid invoice reached its deal or balance"
            body="When a buyer pays and the deal still says unpaid, the invoice shows up here first."
          />
        ) : (
          <List>
            {invoices.rows.map((row) => {
              const problem = PROBLEM[row.problem];
              return (
                <ListItem
                  key={row.id}
                  padded={false}
                  flag={row.landed === null ? "danger" : undefined}
                >
                  <div className="px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="font-mono text-[0.8125rem] font-medium break-all text-fg">
                            {row.reference}
                          </span>
                          <span className="text-xs text-subtle">
                            {row.purpose === "DEAL"
                              ? "Deal payment"
                              : "Wallet top-up"}
                          </span>
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
                              className="ml-1"
                            />
                          ) : (
                            <Waited
                              since={row.createdAt}
                              prefix="raised"
                              className="ml-1"
                            />
                          )}
                        </div>
                      </div>
                      <Amount
                        cents={row.amountUsd}
                        caption={`${exactUsd(row.amountUsd)} invoiced`}
                      />
                    </div>

                    <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.8125rem] text-muted">
                      <Link
                        href={`/admin/users/${row.user.id}`}
                        className={linkClass}
                      >
                        {row.user.name}
                      </Link>
                      <Sep />
                      <span className="break-all">{row.user.email}</span>
                      {row.order ? (
                        <>
                          <Sep />
                          <span>deal</span>
                          <RefLink href={`/dashboard/deals/${row.order.id}`}>
                            {row.order.reference}
                          </RefLink>
                          <span>
                            owes{" "}
                            <span className="text-fg tabular-nums">
                              {exactUsd(row.order.totalUsd)}
                            </span>
                          </span>
                        </>
                      ) : null}
                    </p>

                    <p className="mt-3 max-w-[78ch] border-l-2 border-line-strong pl-3 text-sm leading-relaxed text-fg">
                      {invoiceAdvice(row)}
                    </p>

                    <p className="mt-3 text-xs break-all text-subtle">
                      Processor status: {row.lastStatus ?? "none yet"}
                      {row.externalId ? (
                        <>
                          {" · processor id "}
                          <span className="font-mono text-muted">
                            {row.externalId}
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>
                </ListItem>
              );
            })}
          </List>
        )}
        {invoices.total > invoices.rows.length ? (
          <p className="mt-2.5 text-xs text-subtle">
            Showing the oldest {invoices.rows.length} of{" "}
            {invoices.total.toLocaleString("en-US")}. Work these and the rest
            move up.
          </p>
        ) : null}
      </Section>

      {/* ------------------------------------------------ right now */}
      <Section
        id="now"
        title="Right now"
        description="Where the money is at this moment, whatever month is selected below. Everything here is worked out from the ledger rows, not from what the deals say should have happened."
      >
        <StatGrid columns={3} className="grid-cols-1 sm:grid-cols-2">
          <MoneyMetric
            label="Held for Fastest buyers"
            cents={position.heldForBuyers.cents}
            count={plural(position.heldForBuyers.count, "deal")}
            icon={LockIcon}
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
            note="Every fee earned since the start, less fees given back and balance corrections we paid for. The only part of the money here that belongs to Channel Adda."
          />
          <MoneyMetric
            label="Should be on hand"
            cents={position.onHand}
            icon={LandmarkIcon}
            className="sm:col-span-2"
            note="The three above added up: what our crypto accounts should hold, before processor and network fees. If they hold much less, stop and find out why."
          />
        </StatGrid>

        <div className="mt-3">
          {mismatches.length === 0 ? (
            <AllClear
              title="The books agree with every Fastest deal"
              body="Each running Fastest deal has exactly its price plus fee on our books, and each finished one has nothing left. Checked every time this page loads."
            />
          ) : (
            <>
              <Callout
                tone="danger"
                icon={ScaleIcon}
                title={
                  <>
                    {plural(mismatches.length, "Fastest deal")} where the books
                    and the deal disagree
                  </>
                }
              >
                The money on our books for these deals is not what the deal says
                we should be holding. This should never happen. Do not refund,
                release or correct anything on them until a developer has
                looked.
              </Callout>
              <TableCard className="mt-3">
                <table className="w-full min-w-[30rem]">
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
                      <Tr key={row.id}>
                        <Td>
                          <RefLink href={`/dashboard/deals/${row.id}`}>
                            {row.reference}
                          </RefLink>
                        </Td>
                        <Td>
                          <OrderStatusBadge status={row.status} />
                        </Td>
                        <Td numeric className="font-medium text-fg">
                          {exactUsd(row.heldUsd)}
                        </Td>
                        <Td numeric className="text-muted">
                          {exactUsd(row.expectedUsd)}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </table>
              </TableCard>
            </>
          )}
        </div>
      </Section>

      {/* ------------------------------------------------- the month */}
      <section
        id="month"
        aria-labelledby="month-heading"
        className="mt-12 border-t border-line pt-8"
      >
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <h2
              id="month-heading"
              className="flex flex-wrap items-baseline gap-x-2 text-lg leading-7 font-semibold tracking-[-0.012em] text-fg"
            >
              <span className="font-medium text-muted">Monthly report</span>
              <Sep />
              <span>{month.label}</span>
              {isCurrent ? (
                <span className="text-sm font-normal text-subtle">so far</span>
              ) : null}
            </h2>
            <p className="mt-1 max-w-[68ch] text-[0.8125rem] leading-relaxed text-muted">
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

        <Section
          id="fees"
          title="Fees earned"
          description="Revenue here is fees and nothing else: on a Safest deal the price goes buyer to seller and never touches our books, and on a Fastest deal the price is the seller's money, which we only hold."
        >
          <div className="grid gap-3 lg:grid-cols-[17rem_minmax(0,1fr)]">
            <MoneyMetric
              label="Net fees earned"
              cents={fees.net}
              icon={ReceiptIcon}
              note={
                <>
                  Every fee in the table, less Safest fees given back. This is
                  the month&rsquo;s revenue. Channel prices are never revenue.
                </>
              }
            />

            <TableCard>
              <table className="w-full min-w-[32rem]">
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
                    <Tr key={row.mode}>
                      <Td>
                        <DealModeBadge mode={row.mode} />
                        <span className="mt-1 block text-xs text-subtle tabular-nums">
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
                    </Tr>
                  ))}
                  <Tr>
                    <Td>
                      <span className="text-[0.8125rem] text-muted">
                        Given back
                      </span>
                      <span className="mt-0.5 block text-xs text-subtle tabular-nums">
                        {plural(fees.returned.count, "Safest refund")}
                      </span>
                    </Td>
                    <Td numeric />
                    <Td numeric />
                    <Td numeric>
                      <Amount
                        cents={0 - fees.returned.cents}
                        caption={exactUsd(0 - fees.returned.cents)}
                        tone={fees.returned.cents > 0 ? "danger" : "neutral"}
                      />
                    </Td>
                  </Tr>
                  <tr className="border-t border-line-strong bg-surface-2/50">
                    <Td className="font-semibold text-fg">Net</Td>
                    <Td numeric />
                    <Td numeric>
                      <span className="text-xs text-subtle">
                        gross {exactUsd(grossFees)}
                      </span>
                    </Td>
                    <Td numeric>
                      <Amount cents={fees.net} caption={exactUsd(fees.net)} />
                    </Td>
                  </tr>
                </tbody>
              </table>
            </TableCard>
          </div>

          <div className="mt-4 max-w-[96ch] text-xs leading-relaxed text-muted">
            <p>
              A Safest fee is earned when the buyer&rsquo;s opening payment
              clears; a Fastest fee only when the deal completes, because until
              then it is part of the money we hold.
            </p>
            <dl className="mt-2 grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
              <div>
                <dt className="inline font-medium text-fg">Safest buyer fee</dt>
                <dd className="inline">
                  {" "}
                  — the admin fee Safest buyers paid us, counted when their
                  opening payment cleared.
                </dd>
              </div>
              <div>
                <dt className="inline font-medium text-fg">
                  Safest seller fee
                </dt>
                <dd className="inline">
                  {" "}
                  — there is none: the price goes buyer to seller, so there is
                  nothing for us to deduct it from.
                </dd>
              </div>
              <div>
                <dt className="inline font-medium text-fg">
                  Fastest buyer fee
                </dt>
                <dd className="inline">
                  {" "}
                  — the fee on top of the price, from Fastest deals that
                  completed this month.
                </dd>
              </div>
              <div>
                <dt className="inline font-medium text-fg">
                  Fastest seller fee
                </dt>
                <dd className="inline">
                  {" "}
                  — taken from the seller&rsquo;s price on Fastest deals that
                  completed this month, at the seller-fee rate.
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="inline font-medium text-fg">Given back</dt>
                <dd className="inline">
                  {" "}
                  — Safest admin fees refunded because the deal was cancelled
                  before an agent took the channel. Fastest refunds are not
                  here: they return money we were holding, not money we had
                  earned.
                </dd>
              </div>
            </dl>
          </div>
        </Section>

        <Section
          id="flows"
          title="Money that moved"
          description="Everything else that went in or out during the month. None of it is revenue; most of it is other people's money passing through."
        >
          <List>
            <MoneyLine
              label="Paid into Fastest deals"
              cents={figures.fastest.paidIn.cents}
              count={plural(figures.fastest.paidIn.count, "deal")}
              icon={ArrowDownLeftIcon}
              note="Price plus fee from Fastest buyers, by crypto or from their balance. We hold it until the deal ends."
            />
            <MoneyLine
              label="Credited to sellers"
              cents={figures.fastest.toSellers.cents}
              count={plural(figures.fastest.toSellers.count, "sale")}
              icon={BanknoteIcon}
              note="Sale prices released into sellers' wallets when Fastest deals completed, less the seller fee. Still with us until they withdraw it."
            />
            <MoneyLine
              label="Refunded to buyers"
              cents={figures.refunds.total}
              count={plural(
                figures.refunds.fastest.count + figures.refunds.safest.count,
                "refund",
              )}
              icon={RotateCcwIcon}
              note={
                <>
                  Returned to buyers&rsquo; Channel Adda balances:{" "}
                  <span className="tabular-nums">
                    {exactUsd(figures.refunds.fastest.cents)}
                  </span>{" "}
                  of held Fastest money,{" "}
                  <span className="tabular-nums">
                    {exactUsd(figures.refunds.safest.cents)}
                  </span>{" "}
                  of Safest admin fees.
                </>
              }
            />
            <MoneyLine
              label="Deposits"
              cents={figures.deposits.topUps.cents}
              count={plural(figures.deposits.topUps.count, "top-up")}
              icon={ArrowDownLeftIcon}
              note="Money members paid in to their own balance."
            />
            <MoneyLine
              label="Deal payments to balances"
              cents={figures.deposits.dealPayments.cents}
              count={plural(figures.deposits.dealPayments.count, "payment")}
              icon={WalletIcon}
              note="Deal payments that arrived after the deal had stopped, or paid a deal twice. Credited to the payer's balance rather than lost."
            />
            <MoneyLine
              label="Paid from balances"
              cents={figures.spentFromBalances.cents}
              count={plural(figures.spentFromBalances.count, "deal")}
              icon={WalletIcon}
              note="Members paying a deal's opening payment out of their balance instead of by crypto. Moves their money into our hold or our fees."
            />
            <MoneyLine
              label="Payouts sent"
              cents={figures.payouts.cents}
              count={plural(figures.payouts.count, "payout")}
              icon={ArrowUpRightIcon}
              href="/admin/payouts"
              note="Withdrawals finance marked as sent. This is money that left us for members' own crypto wallets."
            />
            <MoneyLine
              label="Corrections added"
              cents={figures.adjustments.credits.cents}
              count={plural(figures.adjustments.credits.count, "correction")}
              icon={SlidersHorizontalIcon}
              href="/admin/money/adjust"
              note="Added to members' balances by hand. Each one came out of our own money, so the books still balance."
            />
            <MoneyLine
              label="Corrections taken"
              cents={figures.adjustments.debits.cents}
              count={plural(figures.adjustments.debits.count, "correction")}
              icon={SlidersHorizontalIcon}
              href="/admin/money/adjust"
              note="Taken from members' balances by hand, usually a credit made by mistake. Each one went back into our own money."
            />
          </List>
        </Section>

        <Section
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
          <StatGrid columns={2} className="grid-cols-1 sm:grid-cols-2">
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
          </StatGrid>
        </Section>

        <Section
          id="exports"
          title="For the accountant"
          description={`Spreadsheet files for ${month.label}, in exact US dollars and cents. Each download is written to the audit trail under your name.`}
        >
          <List>
            <ListItem>
              <div className="flex items-start gap-3">
                <IconTile icon={FileSpreadsheetIcon} />
                <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                  <div className="min-w-0">
                    <p className="text-sm leading-5 font-medium text-fg">
                      Ledger entries
                    </p>
                    <p className="mt-0.5 max-w-[72ch] text-[0.8125rem] leading-relaxed text-muted">
                      Every row written this month: when, what kind, whose side
                      (a member&rsquo;s or ours), the amount, the deal and the
                      note. The platform&rsquo;s rows have no member.
                    </p>
                  </div>
                  <div className="shrink-0">
                    <DownloadLink
                      href={`/api/admin/export/ledger?month=${month.key}`}
                    >
                      Ledger CSV
                    </DownloadLink>
                  </div>
                </div>
              </div>
            </ListItem>
            <ListItem>
              <div className="flex items-start gap-3">
                <IconTile icon={FileSpreadsheetIcon} />
                <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                  <div className="min-w-0">
                    <p className="text-sm leading-5 font-medium text-fg">
                      Payouts sent
                    </p>
                    <p className="mt-0.5 max-w-[72ch] text-[0.8125rem] leading-relaxed text-muted">
                      Every withdrawal marked as sent this month, with the
                      member, the address, the network, the transaction hash and
                      who sent it.
                    </p>
                  </div>
                  <div className="shrink-0">
                    <DownloadLink
                      href={`/api/admin/export/payouts?month=${month.key}`}
                    >
                      Payouts CSV
                    </DownloadLink>
                  </div>
                </div>
              </div>
            </ListItem>
          </List>
        </Section>
      </section>

      <p className="mt-10 flex max-w-[96ch] items-start gap-2 text-xs leading-relaxed text-subtle">
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
