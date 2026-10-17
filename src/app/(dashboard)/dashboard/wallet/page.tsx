import {
  ArrowUpRightIcon,
  BanknoteIcon,
  CheckCircle2Icon,
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
import { PageHead, Section } from "@/components/dashboard/page-parts";
import {
  PayoutAddressForm,
  RequestPayout,
  TopUp,
} from "@/components/dashboard/wallet-panels";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
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
      <PageHead
        title="Wallet"
        description="Your money on Channel Adda: what is here, what is spendable right now, and what every movement was for."
      />

      {justPaid ? (
        <output className="mb-5 flex items-start gap-3 rounded-card border border-verified/40 bg-verified/5 p-4 text-sm leading-relaxed">
          <CheckCircle2Icon
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-verified"
          />
          <span>
            <strong className="font-semibold text-fg">
              Payment received by the processor.
            </strong>{" "}
            It reaches your balance as soon as the network confirms it — usually
            a minute or two. Refresh this page if it is not here yet.
          </span>
        </output>
      ) : null}

      {/* ---- the figures ------------------------------------------------- */}
      <Section>
        <div className="overflow-hidden rounded-panel border border-line bg-surface shadow-soft">
          <dl className="grid gap-6 border-b border-line p-5 sm:grid-cols-2 sm:p-6">
            <div>
              <dt className="flex items-center gap-2 font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase">
                <WalletIcon aria-hidden="true" className="size-3.5" />
                Your balance
              </dt>
              <dd className="mt-2.5 font-display text-[2rem] leading-none font-black text-fg sm:text-[2.5rem]">
                <Price usd={wallet.balanceUsd / 100} />
              </dd>
              <dd className="mt-2.5 text-xs leading-relaxed text-subtle">
                Everything credited to you, less everything already paid out.
              </dd>
            </div>

            <div className="sm:border-l sm:border-line sm:pl-6">
              <dt className="flex items-center gap-2 font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase">
                <CoinsIcon aria-hidden="true" className="size-3.5" />
                Available to use now
              </dt>
              <dd
                className={`mt-2.5 font-display text-[2rem] leading-none font-black sm:text-[2.5rem] ${
                  held ? "text-primary-text" : "text-fg"
                }`}
              >
                <Price usd={wallet.availableUsd / 100} />
              </dd>
              {held ? (
                <dd className="mt-2.5 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary-soft px-3 py-2.5 text-xs leading-relaxed text-fg">
                  <TimerIcon
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-primary-text"
                  />
                  <span>
                    <Price
                      usd={wallet.pendingWithdrawalUsd / 100}
                      className="font-semibold"
                    />{" "}
                    is held while finance checks the payout you asked for. It is
                    still your money — it just cannot be spent twice.
                  </span>
                </dd>
              ) : (
                <dd className="mt-2.5 text-xs leading-relaxed text-subtle">
                  All of it. Nothing is being held against a payout.
                </dd>
              )}
            </div>
          </dl>

          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="min-w-0">
              <p className="font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase">
                Payouts go to
              </p>
              {wallet.payoutAddress ? (
                <p className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs break-all text-fg">
                    {wallet.payoutAddress.address}
                  </span>
                  <Badge variant="neutral">
                    {wallet.payoutAddress.network}
                  </Badge>
                </p>
              ) : (
                <p className="mt-1.5 text-sm text-muted">
                  No address yet. Add one below before you withdraw.
                </p>
              )}
            </div>
            <p className="shrink-0 text-xs leading-relaxed text-subtle sm:max-w-[16rem] sm:text-right">
              {wallet.payoutAddress
                ? "Changing this address holds withdrawals for 24 hours."
                : "Setting an address holds withdrawals for the first 24 hours."}
            </p>
          </div>
        </div>

        <p className="mt-3 flex items-start gap-2.5 rounded-card border border-line bg-surface-2 px-4 py-3.5 text-xs leading-relaxed text-muted">
          <InfoIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-primary-text"
          />
          <span>
            Only <strong className="font-semibold text-fg">Fastest</strong>{" "}
            sales reach this balance, because that is the mode where the buyer
            pays Channel Adda. On a{" "}
            <strong className="font-semibold text-fg">Safest</strong> deal the
            buyer pays you directly, so nothing for that sale ever appears here.{" "}
            <Link
              href="/fees"
              className="font-medium text-primary-text underline-offset-4 hover:underline"
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
      </Section>

      <Section>
        <PayoutAddressForm current={wallet.payoutAddress} />
      </Section>

      {/* ---- history ----------------------------------------------------- */}
      <Section
        title="History"
        description="Every movement in and out of your balance, newest first."
      >
        {wallet.entries.length === 0 ? (
          <div className="flex flex-col items-center rounded-panel border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
            <span
              aria-hidden="true"
              className="flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-subtle"
            >
              <CoinsIcon className="size-5" />
            </span>
            <h3 className="mt-4 font-display text-base font-bold text-fg">
              Nothing has moved yet
            </h3>
            <p className="mx-auto mt-2 max-w-[46ch] text-sm leading-relaxed text-muted">
              When you add funds, complete a Fastest sale or take money out,
              each movement is listed here with what it was for.
            </p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-panel border border-line bg-surface">
            {wallet.entries.map((entry) => {
              const kind = KINDS[entry.kind];
              const out = entry.amountUsd < 0;
              const EntryIcon = kind?.icon ?? CoinsIcon;

              return (
                <li
                  key={entry.id}
                  className="flex items-start gap-3.5 border-t border-line p-4 first:border-t-0 sm:px-5"
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                      out
                        ? "bg-surface-2 text-subtle"
                        : "bg-verified-soft text-verified"
                    }`}
                  >
                    <EntryIcon className="size-[1.1rem]" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-fg">
                      {kind?.title ?? entry.kind}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">
                      {kind?.meaning ??
                        "Ask support if this entry is not clear."}
                    </p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle">
                      <span>{longDate(entry.createdAt)}</span>
                      {entry.note ? (
                        <>
                          <span aria-hidden="true">&middot;</span>
                          <span className="min-w-0 font-mono text-[0.6875rem] break-all">
                            {entry.note}
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>

                  <p
                    className={`tnum shrink-0 text-right text-sm font-bold ${
                      out ? "text-muted" : "text-verified"
                    }`}
                  >
                    <span className="sr-only">
                      {out ? "Out of your balance: " : "Into your balance: "}
                    </span>
                    <span aria-hidden="true">{out ? "−" : "+"}</span>
                    <Price
                      usd={Math.abs(entry.amountUsd) / 100}
                      className="inline"
                    />
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}
