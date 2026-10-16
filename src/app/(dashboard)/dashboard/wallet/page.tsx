import type { Metadata } from "next";
import {
  PayoutAddressForm,
  RequestPayout,
  TopUp,
} from "@/components/dashboard/wallet-panels";
import { Price } from "@/components/ui/price";
import { requireUser } from "@/server/session";
import { getWallet } from "@/server/wallet";

export const metadata: Metadata = {
  title: "Wallet",
  robots: { index: false, follow: false },
};

const KIND_LABELS: Record<string, string> = {
  DEPOSIT: "Added funds",
  ESCROW_HOLD: "Paid into a deal",
  ESCROW_RELEASE: "Sale proceeds",
  SELLER_FEE: "Seller fee",
  BUYER_FEE: "Buyer fee",
  REFUND: "Refund",
  WITHDRAWAL: "Withdrawn",
  ADJUSTMENT: "Adjustment",
};

/**
 * The wallet.
 *
 * Balance and available are shown as two separate figures on purpose. They
 * differ exactly when a payout is sitting in the finance queue, and someone
 * who sees only one number and then cannot spend it has been misled by the
 * interface rather than by the rules.
 */
export default async function WalletPage() {
  const user = await requireUser("/dashboard/wallet");
  const wallet = await getWallet(user.id);
  const held = wallet.pendingWithdrawalUsd > 0;

  return (
    <>
      <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
        Money
      </p>
      <h1 className="mt-2 font-display text-3xl font-black tracking-tight text-fg sm:text-4xl">
        Wallet
      </h1>

      <dl className="mt-6 grid gap-4 rounded-panel border border-line bg-surface p-5 sm:grid-cols-3 sm:p-6">
        <div>
          <dt className="text-xs text-subtle">Balance</dt>
          <dd className="mt-1 font-display text-2xl font-bold text-fg">
            <Price usd={wallet.balanceUsd / 100} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-subtle">Available to use</dt>
          <dd className="mt-1 font-display text-2xl font-bold text-fg">
            <Price usd={wallet.availableUsd / 100} />
          </dd>
          {held ? (
            <dd className="mt-1 text-xs text-muted">
              <Price
                usd={wallet.pendingWithdrawalUsd / 100}
                className="text-muted"
              />{" "}
              is held against a payout being reviewed.
            </dd>
          ) : null}
        </div>
        <div>
          <dt className="text-xs text-subtle">Payout address</dt>
          <dd className="mt-1 font-mono text-xs break-all text-fg">
            {wallet.payoutAddress
              ? `${wallet.payoutAddress.address} (${wallet.payoutAddress.network})`
              : "Not set"}
          </dd>
        </div>
      </dl>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <TopUp />
        <RequestPayout
          availableUsd={wallet.availableUsd}
          hasAddress={wallet.payoutAddress !== null}
        />
      </div>

      <div className="mt-5">
        <PayoutAddressForm current={wallet.payoutAddress} />
      </div>

      <h2 className="mt-10 font-display text-lg font-bold text-fg">History</h2>
      {wallet.entries.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          Nothing yet. Every movement in and out of your balance is listed here
          with what it was for.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {wallet.entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 text-sm"
            >
              <span className="font-medium text-fg">
                {KIND_LABELS[entry.kind] ?? entry.kind}
              </span>
              {entry.note ? (
                <span className="min-w-0 truncate text-xs text-muted">
                  {entry.note}
                </span>
              ) : null}
              <span className="ml-auto text-xs text-subtle">
                {entry.createdAt.toLocaleDateString("en-GB")}
              </span>
              <span
                className={`tnum w-24 text-right font-medium ${entry.amountUsd < 0 ? "text-muted" : "text-verified"}`}
              >
                {entry.amountUsd < 0 ? "−" : "+"}
                <Price
                  usd={Math.abs(entry.amountUsd) / 100}
                  className="inline"
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
