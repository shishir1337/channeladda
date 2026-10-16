import type { Metadata } from "next";
import { PayoutDecision } from "@/components/admin/payout-decision";
import { Price } from "@/components/ui/price";
import { requireRole } from "@/server/session";
import { listPendingWithdrawals } from "@/server/wallet";

export const metadata: Metadata = {
  title: "Payouts",
  robots: { index: false, follow: false },
};

/**
 * The payout queue.
 *
 * FINANCE only — not moderators, not agents. This is the desk that sends real
 * money to an address somebody typed, and the one irreversible action in the
 * product, so the address is shown in full and in a monospaced face rather
 * than truncated to fit a column.
 */
export default async function AdminPayoutsPage() {
  await requireRole("FINANCE");
  const pending = await listPendingWithdrawals();

  return (
    <>
      <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
        Money
      </p>
      <h1 className="mt-2 font-display text-3xl font-black tracking-tight text-fg sm:text-4xl">
        Payouts
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        Each amount is already held against the seller's balance, so nothing
        here can be spent twice while you decide. Sending is irreversible — read
        the address against what the seller saved before you do.
      </p>

      {pending.length === 0 ? (
        <p className="mt-8 text-sm text-muted">Nothing waiting.</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-4">
          {pending.map((payout) => (
            <li
              key={payout.id}
              className="rounded-panel border border-line bg-surface p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="font-display text-xl font-bold text-fg">
                  <Price usd={payout.amountUsd / 100} />
                </p>
                <p className="text-xs text-subtle">
                  requested {payout.requestedAt.toLocaleString("en-GB")}
                </p>
              </div>
              <p className="mt-1 text-sm text-muted">
                {payout.user.name} · {payout.user.email}
              </p>
              <p className="mt-3 rounded-card border border-line bg-surface-2 p-3 font-mono text-xs break-all text-fg">
                {payout.address}
                <span className="ml-2 text-subtle">({payout.network})</span>
              </p>
              <PayoutDecision withdrawalId={payout.id} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
