import {
  ArrowUpRightIcon,
  BanknoteIcon,
  CircleCheckIcon,
  CoinsIcon,
  GemIcon,
  InfoIcon,
  LockIcon,
  PlusIcon,
  RotateCcwIcon,
  SlidersHorizontalIcon,
  TagIcon,
  WalletIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { InfoTip } from "@/components/app/info-tip";
import {
  Card,
  EmptyState,
  IconTile,
  List,
  ListItem,
  PageHeader,
  Section,
  SplitBar,
} from "@/components/app/kit";
import { ResellerPanel } from "@/components/dashboard/reseller-panel";
import {
  PayoutAddressForm,
  RequestPayout,
  TopUp,
} from "@/components/dashboard/wallet-panels";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
import type { LedgerKind } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { ratingFor } from "@/server/reseller-status";
import { requireUser } from "@/server/session";
import { getSettings } from "@/server/settings";
import { getWallet } from "@/server/wallet";

export const metadata: Metadata = {
  title: "Wallet",
  robots: { index: false, follow: false },
};

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * What each ledger row actually was, in words a person recognises.
 *
 * The database calls these things ESCROW_HOLD and ESCROW_RELEASE. Nobody
 * reading their own money is obliged to learn our vocabulary, so every row
 * carries a title and, behind its (i), a sentence explaining why the number
 * moved.
 */
type KindWords = { title: string; meaning: string; icon: Icon };
const KINDS: Record<string, KindWords> = {
  DEPOSIT: {
    title: "You added funds",
    meaning: "A top-up you paid in crypto. Your balance is held in US dollars.",
    icon: PlusIcon,
  },
  ESCROW_HOLD: {
    title: "Paid into a deal",
    meaning:
      "Taken from your balance to pay a deal's opening payment — the whole amount on Fastest, our fee on Safest. Channel Adda holds it until the deal finishes.",
    icon: LockIcon,
  },
  ESCROW_RELEASE: {
    title: "A sale was paid out to you",
    meaning:
      "A deal finished and the channel is the buyer's, so the price Channel Adda was holding became yours.",
    icon: BanknoteIcon,
  },
  SELLER_FEE: {
    title: "Channel Adda's seller fee",
    meaning:
      "Taken from the sale price when the deal completed. Nothing is charged on a deal that falls through.",
    icon: TagIcon,
  },
  BUYER_FEE: {
    title: "Channel Adda's buyer fee",
    meaning:
      "The fee for running the deal: checking the account, and an agent supervising the transfer.",
    icon: TagIcon,
  },
  REFUND: {
    title: "Money came back to you",
    meaning:
      "A deal did not go ahead, so what Channel Adda was holding for you came back. A Safest admin fee is kept once our agent has held the channel — it pays for that work.",
    icon: RotateCcwIcon,
  },
  WITHDRAWAL: {
    title: "Sent to your payout address",
    meaning:
      "Paid out to the wallet address you gave us. The network fee is taken by the blockchain, not by us.",
    icon: ArrowUpRightIcon,
  },
  ADJUSTMENT: {
    title: "Corrected by Channel Adda",
    meaning: "Staff changed your balance by hand. The note says why.",
    icon: SlidersHorizontalIcon,
  },
  BADGE_FEE: {
    title: "Reseller badge, 30 days",
    meaning:
      "Paid from your balance for 30 days of the Reseller badge. A badge paid with crypto shows here too, after the payment that funded it.",
    icon: GemIcon,
  },
} satisfies Record<LedgerKind, KindWords>;

/** Unambiguous in every locale: "17 Oct 2026" rather than 17/10 or 10/17. */
function longDate(date: Date) {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** The two headline figures share one size: neither is the small print. */
const FIGURE =
  "mt-2 text-[2rem] leading-10 font-semibold tracking-[-0.025em] text-fg tabular-nums sm:text-[2.5rem] sm:leading-[3rem]";

const FIGURE_LABEL =
  "flex items-center gap-2 text-[0.8125rem] leading-5 font-medium text-muted";

/**
 * The wallet.
 *
 * Balance and available are shown as two separate figures on purpose. They
 * differ exactly when a payout is sitting in the finance queue, and someone
 * who sees only one number and then cannot spend it has been misled by the
 * interface rather than by the rules.
 */
export default async function WalletPage({
  searchParams,
}: PageProps<"/dashboard/wallet">) {
  const user = await requireUser("/dashboard/wallet");
  const [wallet, settings, params, rating] = await Promise.all([
    getWallet(user.id),
    getSettings(),
    searchParams,
    ratingFor(user.id),
  ]);
  const held = wallet.pendingWithdrawalUsd > 0;

  // startTopUp sends people back here with ?topped=1 and nothing read it,
  // so somebody who had just paid landed on an unchanged page with no sign
  // it had worked. The credit arrives by webhook and may well land after
  // the redirect, so this says “on its way” rather than claiming it is in.
  const justPaid = params.topped === "1" || params.badge === "1";

  return (
    <>
      <PageHeader
        title="Wallet"
        info="What is here, what is spendable right now, and what every movement was for."
      />

      {/* The success Callout's look, built from spans: an <output> may only
          hold phrasing content, and the kit's Callout is made of divs. */}
      {justPaid ? (
        <output className="mb-6 flex items-start gap-3 rounded-card border border-verified/20 bg-verified-soft/80 px-4 py-3.5">
          <CircleCheckIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-verified"
          />
          <span className="min-w-0 text-[0.8125rem] leading-relaxed text-muted">
            <strong className="block text-sm leading-5 font-medium text-fg">
              Payment received by the processor.
            </strong>
            <span className="mt-0.5 block">
              It reaches your balance as soon as the network confirms it —
              usually a minute or two. Refresh this page if it is not here yet.
            </span>
          </span>
        </output>
      ) : null}

      {/* ---- the figures ------------------------------------------------- */}
      <Section>
        <Card>
          <dl className="grid sm:grid-cols-2">
            <div className="p-4 sm:p-6">
              <dt className={FIGURE_LABEL}>
                <WalletIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-subtle"
                />
                Your balance
                <InfoTip label="About your balance">
                  Everything credited to you, less everything already paid out.
                </InfoTip>
              </dt>
              <dd className={FIGURE}>
                <Price usd={wallet.balanceUsd / 100} />
              </dd>
            </div>

            <div className="border-t border-line p-4 sm:border-t-0 sm:border-l sm:p-6">
              <dt className={FIGURE_LABEL}>
                <CoinsIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-subtle"
                />
                Available to use now
                <InfoTip label="About what is available">
                  {held ? (
                    <>
                      <Price
                        usd={wallet.pendingWithdrawalUsd / 100}
                        className="font-semibold text-fg"
                      />{" "}
                      is held while finance checks the payout you asked for. It
                      is still your money — it just cannot be spent twice.
                    </>
                  ) : (
                    "All of it. Nothing is being held against a payout."
                  )}
                </InfoTip>
              </dt>
              <dd className={FIGURE}>
                <Price usd={wallet.availableUsd / 100} />
              </dd>
            </div>
          </dl>

          {/* The two figures differ only while a payout waits for finance,
              and then the bar shows where the gap went before any figure
              is compared. */}
          {held ? (
            <div className="border-t border-line px-4 py-4 sm:px-6">
              <SplitBar
                label="Your balance: available now and held for a payout"
                parts={[
                  {
                    label: "Available",
                    value: Math.max(0, wallet.availableUsd),
                    display: <Price usd={wallet.availableUsd / 100} />,
                    tone: "verified",
                  },
                  {
                    label: "Held for your payout",
                    value: wallet.pendingWithdrawalUsd,
                    display: <Price usd={wallet.pendingWithdrawalUsd / 100} />,
                    tone: "primary",
                  },
                ]}
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-2 rounded-b-[inherit] border-t border-line bg-surface-2/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
            <div className="min-w-0">
              <p className="text-xs leading-5 font-medium text-muted">
                Payouts go to
              </p>
              {wallet.payoutAddress ? (
                <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
                  <span className="min-w-0 font-mono text-xs break-all text-fg">
                    {wallet.payoutAddress.address}
                  </span>
                  <Badge size="sm" variant="neutral">
                    {wallet.payoutAddress.network}
                  </Badge>
                </p>
              ) : (
                <p className="mt-0.5 text-[0.8125rem] text-fg">
                  No address yet. Add one below before you withdraw.
                </p>
              )}
            </div>
            <p className="shrink-0 text-xs leading-relaxed text-subtle sm:max-w-[17rem] sm:text-right">
              {wallet.payoutAddress
                ? "Changing this address holds withdrawals for 24 hours."
                : "Setting an address holds withdrawals for the first 24 hours."}
            </p>
          </div>
        </Card>

        {/* In sight, as one quiet line: a seller looking for their money
            needs to see at once when it arrives here, and that a Safest price
            never does. */}
        <div className="mt-3 flex items-start gap-2 text-[0.8125rem] leading-relaxed text-muted">
          <InfoIcon
            aria-hidden="true"
            className="mt-[0.1875rem] size-3.5 shrink-0 text-subtle"
          />
          <p className="max-w-[72ch]">
            A Fastest sale reaches this balance when its transfer completes. A
            Safest buyer pays you directly, so it never comes through here.
            Until then a Fastest buyer&rsquo;s payment is held by Channel Adda
            and listed under{" "}
            <strong className="font-semibold text-fg">
              Held for your sales
            </strong>
            .{" "}
            <Link
              href="/fees"
              className="font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:decoration-fg"
            >
              How the two modes differ
            </Link>
            .
          </p>
        </div>
      </Section>

      {/* ---- held for your sales ---------------------------------------- */}
      {wallet.heldForSales.length > 0 ? (
        <Section
          id="held"
          title="Held for your sales"
          count={wallet.heldForSales.length}
          info="The buyer has paid Channel Adda for these. We hold it until the transfer completes, then it moves to your balance. Until then it cannot be withdrawn, so it can still go back to the buyer if the channel never reaches them."
          actions={
            <Price
              usd={wallet.heldForSalesUsd / 100}
              className="text-sm leading-5 font-semibold text-fg tabular-nums"
            />
          }
        >
          <List>
            {wallet.heldForSales.map((sale) => (
              <ListItem key={sale.orderId}>
                <div className="flex items-center gap-3">
                  <IconTile icon={LockIcon} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm leading-5 font-medium text-fg">
                      {sale.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-subtle">
                      <Link
                        href={`/dashboard/deals/${sale.orderId}`}
                        className="font-mono text-muted underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:text-fg hover:decoration-fg"
                      >
                        {sale.reference}
                      </Link>{" "}
                      · Moves to your balance when the transfer completes.
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Price
                      usd={sale.amountUsd / 100}
                      className="text-sm leading-5 font-semibold text-fg tabular-nums"
                    />
                    <p className="mt-0.5 text-xs leading-5 whitespace-nowrap text-subtle">
                      paid{" "}
                      <time dateTime={sale.paidAt.toISOString()}>
                        {longDate(sale.paidAt)}
                      </time>
                    </p>
                  </div>
                </div>
              </ListItem>
            ))}
          </List>
        </Section>
      ) : null}

      {/* ---- putting money in, taking it out ----------------------------- */}
      <Section>
        <div className="grid gap-4 lg:grid-cols-2">
          <TopUp />
          <RequestPayout
            availableUsd={wallet.availableUsd}
            hasAddress={wallet.payoutAddress !== null}
            minimumUsd={settings.minWithdrawalUsd}
          />
        </div>
        <div className="mt-4">
          <PayoutAddressForm current={wallet.payoutAddress} />
        </div>
      </Section>

      {/* ---- the Reseller badge ------------------------------------------ */}
      <Section id="reseller">
        <ResellerPanel
          priceUsd={settings.resellerPriceUsd}
          discountBp={settings.resellerDiscountBp}
          multiplier={settings.resellerPointsMultiplier}
          active={rating.reseller}
          endsAt={rating.endsAt ? rating.endsAt.toISOString() : null}
          points={rating.points}
          availableUsd={wallet.availableUsd}
          sellerFeeBp={settings.sellerFeeBp}
        />
      </Section>

      {/* ---- history ----------------------------------------------------- */}
      <Section
        id="history"
        title="History"
        info="Every movement in and out of your balance, newest first."
      >
        {wallet.entries.length === 0 ? (
          <EmptyState
            icon={CoinsIcon}
            title="Nothing has moved yet"
            body="When you add funds, complete a sale or take money out, each movement is listed here with what it was for."
          />
        ) : (
          <List>
            {wallet.entries.map((entry) => {
              const kind = KINDS[entry.kind];
              const out = entry.amountUsd < 0;
              const EntryIcon = kind?.icon ?? CoinsIcon;

              const title = kind?.title ?? entry.kind;

              return (
                <ListItem key={entry.id}>
                  <div className="flex items-center gap-3">
                    <IconTile icon={EntryIcon} />

                    <div className="min-w-0 flex-1">
                      {/* What the kind of movement means is the same on every
                          row of that kind, so it waits behind the (i) rather
                          than repeating down the list. */}
                      <p className="flex items-center gap-1.5 text-sm leading-5 font-medium text-fg">
                        <span className="min-w-0">{title}</span>
                        <InfoTip label={`What “${title}” means`}>
                          {kind?.meaning ??
                            "Ask support if this entry is not clear."}
                        </InfoTip>
                      </p>
                      {entry.note ? (
                        <p className="mt-1 text-xs leading-relaxed break-words text-subtle">
                          {entry.note}
                        </p>
                      ) : null}
                    </div>

                    {/* Signed, with the sign spoken: a credit is green, a
                        debit stays neutral, because money leaving for a
                        reason you chose is not an alarm. */}
                    <div className="shrink-0 text-right">
                      <p
                        className={cn(
                          "text-sm leading-5 font-semibold tabular-nums",
                          out ? "text-fg" : "text-verified",
                        )}
                      >
                        <span className="sr-only">
                          {out
                            ? "Out of your balance: "
                            : "Into your balance: "}
                        </span>
                        <span aria-hidden="true">{out ? "−" : "+"}</span>
                        <Price
                          usd={Math.abs(entry.amountUsd) / 100}
                          className="inline"
                        />
                      </p>
                      <p className="mt-0.5 text-xs leading-5 whitespace-nowrap text-subtle">
                        <time dateTime={entry.createdAt.toISOString()}>
                          {longDate(entry.createdAt)}
                        </time>
                      </p>
                    </div>
                  </div>
                </ListItem>
              );
            })}
          </List>
        )}
      </Section>
    </>
  );
}
