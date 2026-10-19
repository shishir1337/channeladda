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
import type { ComponentProps, ReactNode } from "react";
import {
  DownloadLink,
  exactUsd,
  linkClass,
  MoneyLine,
  MoneyMetric,
  MoneyTerms,
  MonthPicker,
  plural,
  RefLink,
} from "@/components/admin/money-parts";
import {
  DealModeBadge,
  OrderStatusBadge,
  Waited,
} from "@/components/admin/vocab";
import { InfoTip } from "@/components/app/info-tip";
import {
  AllClear,
  Amount,
  Callout,
  Disclosure,
  IconTile,
  List,
  ListItem,
  MetaItem,
  PageHeader,
  Section,
  Sep,
  SplitBar,
  StatGrid,
  TableCard,
  Td,
  Th,
  Tr,
} from "@/components/app/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import {
  holdMismatches,
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
 * Written for an owner reading it, not an engineer: every figure says what
 * it counts — behind the (i) beside it, or folded under its list, so the
 * figures are what gets read first — revenue is only ever fees, and the
 * order is the order somebody should act in — what needs a person, then
 * where the money is right now, then the month's report and its exports.
 * Warnings about money at risk and anything that cannot be undone stay in
 * plain sight.
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
  await requireRole("FINANCE");
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
    holdMismatches(),
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
  const unapplied = invoices.rows.filter((row) => row.landed === null);

  // Held + members' wallets + ours is exactly what should be on hand. "Ours"
  // can be below zero — corrections we paid for can outrun the fees — and a
  // bar cannot draw a negative part, so then it is named beside the bar
  // instead of drawn in it.
  const oursBelowZero = position.platformOwn < 0;
  const onHandParts: ComponentProps<typeof SplitBar>["parts"] = [
    {
      label: "Held for buyers",
      value: position.heldForBuyers.cents,
      display: <Price usd={position.heldForBuyers.cents / 100} />,
      tone: "info",
    },
    {
      label: "In members' wallets",
      value: position.memberBalances.cents,
      display: <Price usd={position.memberBalances.cents / 100} />,
      // Solid, not grey: a grey part reads as the empty end of a half-full bar.
      tone: "neutral",
    },
    ...(oursBelowZero
      ? []
      : [
          {
            label: "Ours",
            value: position.platformOwn,
            display: <Price usd={position.platformOwn / 100} />,
            tone: "verified" as const,
          },
        ]),
  ];

  // Everything else that moved in the month. The rows and the definitions
  // folded under them are drawn from this one list, so no row is ever
  // without the sentence saying what it counts.
  const flows: (ComponentProps<typeof MoneyLine> & { note: ReactNode })[] = [
    {
      label: "Paid into deals",
      cents: figures.deals.paidIn.cents,
      count: plural(figures.deals.paidIn.count, "payment"),
      icon: ArrowDownLeftIcon,
      note: "Everything buyers paid us for deals, by crypto or from their balance: price and fee on Fastest, the fee and then the price on Safest. We hold it until it is earned or given back.",
    },
    {
      label: "Credited to sellers",
      cents: figures.deals.toSellers.cents,
      count: plural(figures.deals.toSellers.count, "sale"),
      icon: BanknoteIcon,
      note: "Sale prices released into sellers' wallets when deals completed, less the seller fee. Still with us until they withdraw it.",
    },
    {
      label: "Refunded to buyers",
      cents: figures.refunds.total,
      count: plural(
        figures.refunds.fastest.count + figures.refunds.safest.count,
        "refund",
      ),
      icon: RotateCcwIcon,
      note: (
        <>
          Returned to buyers&rsquo; Channel Adda balances:{" "}
          <span className="tabular-nums">
            {exactUsd(figures.refunds.fastest.cents)}
          </span>{" "}
          from Fastest deals,{" "}
          <span className="tabular-nums">
            {exactUsd(figures.refunds.safest.cents)}
          </span>{" "}
          from Safest deals. Always money we were holding, never fees we had
          earned.
        </>
      ),
    },
    {
      label: "Deposits",
      cents: figures.deposits.topUps.cents,
      count: plural(figures.deposits.topUps.count, "top-up"),
      icon: ArrowDownLeftIcon,
      note: "Money members paid in to their own balance.",
    },
    {
      label: "Deal payments to balances",
      cents: figures.deposits.dealPayments.cents,
      count: plural(figures.deposits.dealPayments.count, "payment"),
      icon: WalletIcon,
      note: "Deal payments that arrived after the deal had stopped, or paid a deal twice. Credited to the payer's balance rather than lost.",
    },
    {
      label: "Paid from balances",
      cents: figures.spentFromBalances.cents,
      count: plural(figures.spentFromBalances.count, "deal"),
      icon: WalletIcon,
      note: "Members paying a deal's opening payment out of their balance instead of by crypto. Moves their money into our hold or our fees.",
    },
    {
      label: "Badges from balances",
      cents: figures.spentOnBadges.cents,
      count: plural(figures.spentOnBadges.count, "pass", "passes"),
      icon: WalletIcon,
      note: "Members buying the Reseller badge out of their balance — including badges paid by crypto, which arrive as a deposit and are spent on the pass at once.",
    },
    {
      label: "Payouts sent",
      cents: figures.payouts.cents,
      count: plural(figures.payouts.count, "payout"),
      icon: ArrowUpRightIcon,
      href: "/admin/payouts",
      note: "Withdrawals finance marked as sent. This is money that left us for members' own crypto wallets.",
    },
    {
      label: "Corrections added",
      cents: figures.adjustments.credits.cents,
      count: plural(figures.adjustments.credits.count, "correction"),
      icon: SlidersHorizontalIcon,
      href: "/admin/money/adjust",
      note: "Added to members' balances by hand. Each one came out of our own money, so the books still balance.",
    },
    {
      label: "Corrections taken",
      cents: figures.adjustments.debits.cents,
      count: plural(figures.adjustments.debits.count, "correction"),
      icon: SlidersHorizontalIcon,
      href: "/admin/money/adjust",
      note: "Taken from members' balances by hand, usually a credit made by mistake. Each one went back into our own money.",
    },
  ];

  return (
    <>
      <PageHeader
        title="Money desk"
        info="What Channel Adda earned, what it is holding for other people, and what it paid out — month by month, straight from the ledger."
        actions={
          <Button asChild variant="secondary">
            <Link href="/admin/money/adjust">
              <SlidersHorizontalIcon aria-hidden="true" />
              Correct a balance
            </Link>
          </Button>
        }
        meta={<MetaItem label="Read">{now.toLocaleString("en-GB")}</MetaItem>}
      />

      {/* --------------------------------------------- needs a person */}
      <Section
        id="invoices"
        title="Paid at the processor, not applied"
        count={invoices.total}
        tone={unapplied.length > 0 ? "danger" : "neutral"}
        info="The sweep retries every ten minutes, so anything here for longer than that needs you."
        description="Check each one in the processor's dashboard by its reference before acting: recording a payment by hand cannot be undone."
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
        info="Where the money is at this moment, whatever month is selected below. Everything here is worked out from the ledger rows, not from what the deals say should have happened."
      >
        <StatGrid columns={3} className="grid-cols-1 sm:grid-cols-2">
          <MoneyMetric
            label="Held for buyers"
            cents={position.heldForBuyers.cents}
            count={plural(position.heldForBuyers.count, "deal")}
            icon={LockIcon}
            note="Not ours"
            info="What buyers have paid into deals still running: price and fee on Fastest, the fee alone on Safest. Not ours: the price becomes the seller's when a Fastest deal completes, the fee ours when it is earned, and anything else goes back to the buyer."
          />
          <MoneyMetric
            label="In members' wallets"
            cents={position.memberBalances.cents}
            count={plural(position.memberBalances.count, "member")}
            icon={WalletIcon}
            note="Money we owe members"
            info="Every member balance added together — money we owe members, which they can spend on a deal or withdraw."
          />
          <MoneyMetric
            label="Payouts waiting"
            cents={position.pendingPayouts.cents}
            count={plural(position.pendingPayouts.count, "request")}
            icon={CoinsIcon}
            href="/admin/payouts"
            tone={position.pendingPayouts.count > 0 ? "primary" : "neutral"}
            note="Already counted inside members' wallets"
            info="Asked for and not sent yet. Already counted inside members' wallets — it is the part of their money they have asked to take out."
          />
          <MoneyMetric
            label="Ours"
            cents={position.platformOwn}
            icon={PiggyBankIcon}
            note="Belongs to Channel Adda"
            info="Every fee earned since the start, less fees given back and balance corrections we paid for. The only part of the money here that belongs to Channel Adda."
          />
          <MoneyMetric
            label="Should be on hand"
            cents={position.onHand}
            icon={LandmarkIcon}
            className="sm:col-span-2"
            // The warning stays in sight: it is the one line on this desk
            // that says money may be missing.
            note="The three above added up: what our crypto accounts should hold, before processor and network fees. If they hold much less, stop and find out why."
            visual={
              <>
                <SplitBar
                  label="Where the money that should be on hand sits"
                  parts={onHandParts}
                />
                {oursBelowZero ? (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-muted">
                    Ours
                    <span className="font-medium text-danger tabular-nums">
                      <Price usd={position.platformOwn / 100} />
                    </span>
                  </p>
                ) : null}
              </>
            }
          />
        </StatGrid>

        <div className="mt-3">
          {mismatches.length === 0 ? (
            <AllClear
              title={
                <>
                  The books agree with every deal{" "}
                  <InfoTip label="About this check">
                    Each running deal has exactly what its buyer has paid in on
                    our books, and each finished one has nothing left.
                  </InfoTip>
                </>
              }
              body="Checked every time this page loads."
            />
          ) : (
            <>
              <Callout
                tone="danger"
                icon={ScaleIcon}
                title={
                  <>
                    {plural(mismatches.length, "deal")} where the books and the
                    deal disagree
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
                    Deals whose ledger does not match their status
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
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="month-heading"
                className="flex flex-wrap items-baseline gap-x-2 text-lg leading-7 font-semibold tracking-[-0.012em] text-fg"
              >
                <span className="font-medium text-muted">Monthly report</span>
                <Sep />
                <span>{month.label}</span>
                {isCurrent ? (
                  <span className="text-sm font-normal text-subtle">
                    so far
                  </span>
                ) : null}
              </h2>
              <InfoTip label="About the monthly report">
                Months run from midnight to midnight UTC.
                {isCurrent
                  ? " This month is not over, so these figures will still grow."
                  : ""}
              </InfoTip>
            </div>
            {/* Said in sight, because otherwise a page of zeroes reads as a
                month in which nothing happened. */}
            {later ? (
              <p className="mt-1 max-w-[68ch] text-[0.8125rem] leading-relaxed text-muted">
                This month has not started yet, so everything below is empty.
              </p>
            ) : null}
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
          info="Revenue here is fees and nothing else. A channel price is the seller's money, which we only hold."
        >
          <div className="grid gap-3 lg:grid-cols-[17rem_minmax(0,1fr)]">
            <MoneyMetric
              label="Net fees earned"
              cents={fees.net}
              icon={ReceiptIcon}
              note="The month’s revenue"
              info={
                <>
                  Every fee in the table. This is the month&rsquo;s revenue.
                  Channel prices are never revenue.
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
                      <span className="text-sm font-medium text-fg">
                        Reseller badges
                      </span>
                      <span className="mt-1 block text-xs text-subtle tabular-nums">
                        {plural(fees.badges.count, "pass", "passes")}
                      </span>
                    </Td>
                    <Td numeric />
                    <Td numeric />
                    <Td numeric>
                      <Amount
                        cents={fees.badges.cents}
                        caption={exactUsd(fees.badges.cents)}
                      />
                    </Td>
                  </Tr>
                  <tr className="border-t border-line-strong bg-surface-2/50">
                    <Td className="font-semibold text-fg">Net</Td>
                    <Td numeric />
                    <Td numeric />
                    <Td numeric>
                      <Amount cents={fees.net} caption={exactUsd(fees.net)} />
                    </Td>
                  </tr>
                </tbody>
              </table>
            </TableCard>
          </div>

          <Disclosure className="mt-3" title="What each fee means">
            <p>
              A fee is earned when the deal completes &mdash; or, for a Safest
              admin fee, when the deal ends after our agent has taken custody.
              Until then it is part of the money we hold.
            </p>
            <MoneyTerms
              className="mt-3"
              terms={[
                {
                  term: "Safest buyer fee",
                  definition:
                    "the admin fee from Safest deals that completed this month, or that ended after our agent had taken custody.",
                },
                {
                  term: "Safest seller fee",
                  definition: (
                    <>
                      taken from the seller&rsquo;s price on Safest deals that
                      completed this month, at the seller-fee rate.
                    </>
                  ),
                },
                {
                  term: "Fastest buyer fee",
                  definition:
                    "the fee on top of the price, from Fastest deals that completed this month.",
                },
                {
                  term: "Fastest seller fee",
                  definition: (
                    <>
                      taken from the seller&rsquo;s price on Fastest deals that
                      completed this month, at the seller-fee rate.
                    </>
                  ),
                },
              ]}
            />
          </Disclosure>
        </Section>

        <Section
          id="flows"
          title="Money that moved"
          info="Everything else that went in or out during the month. None of it is revenue; most of it is other people's money passing through."
        >
          <List>
            {flows.map((flow) => (
              <MoneyLine
                key={flow.label}
                label={flow.label}
                cents={flow.cents}
                count={flow.count}
                icon={flow.icon}
                href={flow.href}
              />
            ))}
          </List>
          <Disclosure className="mt-3" title="What each line counts">
            <MoneyTerms
              terms={flows.map((flow) => ({
                term: flow.label,
                definition: flow.note,
              }))}
            />
          </Disclosure>
        </Section>

        <Section
          id="closing"
          title={
            isCurrent || later ? "Position so far" : "At the close of the month"
          }
          info={
            isCurrent || later
              ? "The month has not closed, so these match right now."
              : `What we were holding for other people at midnight UTC on ${figures.closing.asOf.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })} — the figures an accountant carries into the next month.`
          }
        >
          <StatGrid columns={2} className="grid-cols-1 sm:grid-cols-2">
            <MoneyMetric
              label="Held for buyers"
              cents={figures.closing.heldForBuyers}
              icon={LockIcon}
              info="What buyers had paid into deals that were still running when the month closed."
            />
            <MoneyMetric
              label="In members' wallets"
              cents={figures.closing.memberBalances}
              icon={WalletIcon}
              info="Every member balance added together when the month closed: what we owed members."
            />
          </StatGrid>
        </Section>

        <Section
          id="exports"
          title="For the accountant"
          description="Each download is written to the audit trail under your name."
          info={`Spreadsheet files for ${month.label}, in exact US dollars and cents.`}
        >
          <List>
            <ListItem>
              <div className="flex items-center gap-3">
                <IconTile icon={FileSpreadsheetIcon} />
                <p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm leading-5 font-medium text-fg">
                  Ledger entries
                  <InfoTip label="About the ledger file">
                    Every row written this month: when, what kind, whose side (a
                    member&rsquo;s or ours), the amount, the deal and the note.
                    The platform&rsquo;s rows have no member.
                  </InfoTip>
                </p>
                <div className="shrink-0">
                  <DownloadLink
                    href={`/api/admin/export/ledger?month=${month.key}`}
                  >
                    Ledger CSV
                  </DownloadLink>
                </div>
              </div>
            </ListItem>
            <ListItem>
              <div className="flex items-center gap-3">
                <IconTile icon={FileSpreadsheetIcon} />
                <p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm leading-5 font-medium text-fg">
                  Payouts sent
                  <InfoTip label="About the payouts file">
                    Every withdrawal marked as sent this month, with the member,
                    the address, the network, the transaction hash and who sent
                    it.
                  </InfoTip>
                </p>
                <div className="shrink-0">
                  <DownloadLink
                    href={`/api/admin/export/payouts?month=${month.key}`}
                  >
                    Payouts CSV
                  </DownloadLink>
                </div>
              </div>
            </ListItem>
          </List>
        </Section>
      </section>

      <Disclosure bare className="mt-10" title="About these figures">
        <p className="max-w-[96ch]">
          Large figures are shown in whichever currency the header is set to,
          rounded to whole units; the exact US-dollar amount is under each one,
          and the downloads carry it to the cent. Every figure is a sum of
          ledger rows — the record each payout, refund and correction writes as
          it happens — so a deal&rsquo;s status never changes a past month.
        </p>
      </Disclosure>
    </>
  );
}
