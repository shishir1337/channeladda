import type { Metadata } from "next";
import Link from "next/link";
import { Price } from "@/components/ui/price";
import { listDealsFor } from "@/server/deals";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Deals",
  robots: { index: false, follow: false },
};

const SIDE_LABELS = { buyer: "Buying", seller: "Selling", agent: "Holding" };

const AWAITING_LABELS = {
  buyer: "the buyer",
  seller: "the seller",
  agent: "our agent",
  staff: "Channel Adda",
  system: "Channel Adda",
} as const;

/**
 * Every deal, both sides in one list.
 *
 * Same reasoning as the inbox: everyone here buys and sells, so splitting
 * this into a buying tab and a selling tab would hide half of what somebody
 * is doing from them. The side is a label on the row instead.
 */
export default async function DealsPage() {
  const user = await requireUser("/dashboard/deals");
  const deals = await listDealsFor(user.id);

  return (
    <>
      <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
        Transfers
      </p>
      <h1 className="mt-2 font-display text-3xl font-black tracking-tight text-fg sm:text-4xl">
        Deals
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        Everything in progress, on either side. A deal moves one step at a time,
        and the row says who it is waiting on.
      </p>

      {deals.length === 0 ? (
        <div className="mt-8 rounded-panel border border-line bg-surface p-6 text-center">
          <p className="text-sm font-semibold text-fg">No deals yet.</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
            When you buy an account or someone buys one of yours, the handover
            runs here step by step.
          </p>
          <Link
            href="/browse"
            className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary-text underline"
          >
            Browse accounts for sale
          </Link>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-2.5">
          {deals.map((deal) => (
            <li key={deal.id}>
              <Link
                href={`/dashboard/deals/${deal.id}`}
                className="block rounded-card border border-line bg-surface p-4 transition-colors duration-200 hover:border-line-strong hover:bg-surface-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-sm font-semibold text-fg">
                    {deal.listingTitle}
                  </p>
                  <p className="tnum text-xs text-subtle">{deal.reference}</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span className="font-medium text-fg">
                    {SIDE_LABELS[deal.side]}
                  </span>
                  <span>
                    {deal.side === "agent" ? "for" : "with"}{" "}
                    {deal.otherSideName}
                  </span>
                  <span className="text-subtle">
                    {deal.mode === "SAFEST" ? "Safest" : "Fastest"}
                  </span>
                  <Price usd={deal.priceUsd / 100} className="text-muted" />
                </div>
                <p className="mt-2 text-xs text-subtle">
                  {deal.awaiting
                    ? `Waiting on ${AWAITING_LABELS[deal.awaiting]}`
                    : deal.status === "COMPLETED"
                      ? "Completed"
                      : "Closed"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
