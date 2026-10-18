import {
  ArrowUpRightIcon,
  BanknoteIcon,
  CircleCheckIcon,
  CoinsIcon,
  InfoIcon,
  LockIcon,
  PlusIcon,
  RotateCcwIcon,
  SlidersHorizontalIcon,
  TagIcon,
  TimerIcon,
  WalletIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import {
  Card,
  EmptyState,
  IconTile,
  List,
  ListItem,
  PageHeader,
  Section,
} from "@/components/app/kit";
import {
  PayoutAddressForm,
  RequestPayout,
  TopUp,
} from "@/components/dashboard/wallet-panels";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
import { cn } from "@/lib/utils";
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
 * carries a title and a sentence explaining why the number moved.
 */
const KINDS: Record<string, { title: string; meaning: string; icon: Icon }> = {
  DEPOSIT: {
    title: "You added funds",
    meaning: "A top-up you paid in crypto. Your balance is held in US dollars.",
    icon: PlusIcon,
  },
  ESCROW_HOLD: {
    title: "Paid into a deal",
    meaning:
      "Taken from your balance to open a deal. Channel Adda holds it until the deal finishes.",
    icon: LockIcon,
  },
  ESCROW_RELEASE: {
    title: "A sale was paid out to you",
    meaning:
      "A Fastest deal finished and the buyer confirmed they have control, so the money became yours.",
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
    meaning: "A deal did not go ahead, so what you paid was returned in full.",
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
};

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
  const [wallet, settings, params] = await Promise.all([
    getWallet(user.id),
    getSettings(),
    searchParams,
  ]);
  const held = wallet.pendingWithdrawalUsd > 0;

  // startTopUp sends people back here with ?topped=1 and nothing read it,
  // so somebody who had just paid landed on an unchanged page with no sign
  // it had worked. The credit arrives by webhook and may well land after
  // the redirect, so this says “on its way” rather than claiming it is in.
  const justPaid = params.topped === "1";

  return (
    <>
      <PageHeader
        title="Wallet"
        description="What is here, what is spendable right now, and what every movement was for."
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
              </dt>
              <dd className={FIGURE}>
                <Price usd={wallet.balanceUsd / 100} />
              </dd>
              <dd className="mt-1.5 text-xs leading-relaxed text-subtle">
                Everything credited to you, less everything already paid out.
              </dd>
            </div>

            <div className="border-t border-line p-4 sm:border-t-0 sm:border-l sm:p-6">
              <dt className={FIGURE_LABEL}>
                <CoinsIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-subtle"
                />
                Available to use now
              </dt>
              <dd className={FIGURE}>
                <Price usd={wallet.availableUsd / 100} />
              </dd>
              {held ? (
                <dd className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-muted">
                  <TimerIcon
                    aria-hidden="true"
                    className="mt-px size-3.5 shrink-0 text-primary-text"
                  />
                  <span>
                    <Price
                      usd={wallet.pendingWithdrawalUsd / 100}
                      className="font-semibold text-fg"
                    />{" "}
                    is held while finance checks the payout you asked for. It is
                    still your money — it just cannot be spent twice.
                  </span>
                </dd>
              ) : (
                <dd className="mt-1.5 text-xs leading-relaxed text-subtle">
                  All of it. Nothing is being held against a payout.
                </dd>
              )}
            </div>
          </dl>

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

        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted">
          <InfoIcon
            aria-hidden="true"
            className="mt-px size-3.5 shrink-0 text-subtle"
          />
          <span>
            Only <strong className="font-semibold text-fg">Fastest</strong>{" "}
            sales reach this balance, because that is the mode where the buyer
            pays Channel Adda. On a{" "}
            <strong className="font-semibold text-fg">Safest</strong> deal the
            buyer pays you directly, so nothing for that sale ever appears here.{" "}
            <Link
              href="/fees"
              className="font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:decoration-fg"
            >
              How the two modes differ
            </Link>
            .
          </span>
        </p>
      </Section>

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

      {/* ---- history ----------------------------------------------------- */}
      <Section
        id="history"
        title="History"
        description="Every movement in and out of your balance, newest first."
      >
        {wallet.entries.length === 0 ? (
          <EmptyState
            icon={CoinsIcon}
            title="Nothing has moved yet"
            body="When you add funds, complete a Fastest sale or take money out, each movement is listed here with what it was for."
          />
        ) : (
          <List>
            {wallet.entries.map((entry) => {
              const kind = KINDS[entry.kind];
              const out = entry.amountUsd < 0;
              const EntryIcon = kind?.icon ?? CoinsIcon;

              return (
                <ListItem key={entry.id}>
                  <div className="flex items-start gap-3">
                    <IconTile icon={EntryIcon} />

                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-5 font-medium text-fg">
                        {kind?.title ?? entry.kind}
                      </p>
                      <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
                        {kind?.meaning ??
                          "Ask support if this entry is not clear."}
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
