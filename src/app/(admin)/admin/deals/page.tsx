import type { Metadata } from "next";
import Link from "next/link";
import {
  ClaimDeal,
  EndDeal,
  RecordPayment,
} from "@/components/admin/deal-controls";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
import { db } from "@/lib/db";
import {
  listDealActivity,
  listDealsNeedingAgent,
  listDealsNeedingReassignment,
} from "@/server/deal-feed";
import { requireAdminArea } from "@/server/session";

export const metadata: Metadata = {
  title: "Deals",
  robots: { index: false, follow: false },
};

const ACTION_LABELS: Record<string, string> = {
  "deal.created": "Deal opened",
  "deal.fee_paid": "Opening payment cleared",
  "deal.agent_assigned": "Agent assigned",
  "deal.step_completed": "Step completed",
  "deal.completed": "Deal completed",
  "deal.returned": "Channel returned to seller",
  "deal.refunded": "Buyer refunded",
  "deal.cancelled": "Deal cancelled",
  "deal.disputed": "Dispute raised",
};

/**
 * The deal desk.
 *
 * Three things a human has to do, in the order they block on: record a
 * payment that has landed, put an agent on a deal that has none, and move a
 * deal that is stuck. Then the trail of everything that has happened.
 *
 * Agents reach this page; `requireStaff` guards every other admin page, so an
 * agent who wanders to the listing queue gets the same 404 a stranger would.
 */
export default async function AdminDealsPage({
  searchParams,
}: PageProps<"/admin/deals">) {
  await searchParams;

  // Staff and agents both belong here, and the role decides what is shown.
  // The guard deliberately does not depend on the query string: an agent
  // arriving at the bare path from a bookmark or from a link in the activity
  // feed must not get a 404 for a page that is theirs.
  const viewer = await requireAdminArea();
  const isAgent = viewer.role === "AGENT" || viewer.role === "SUPERADMIN";
  const isFinance = viewer.role === "FINANCE" || viewer.role === "SUPERADMIN";

  const [activity, needingAgent, needingReassignment, awaitingPayment] =
    await Promise.all([
      listDealActivity(50),
      listDealsNeedingAgent(),
      listDealsNeedingReassignment(),
      isFinance
        ? db.order.findMany({
            where: { status: "AWAITING_PAYMENT" },
            orderBy: { createdAt: "asc" },
            take: 25,
            select: {
              id: true,
              reference: true,
              mode: true,
              totalUsd: true,
              listing: { select: { title: true } },
            },
          })
        : Promise.resolve([]),
    ]);

  return (
    <>
      <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
        Transfers
      </p>
      <h1 className="mt-2 font-display text-3xl font-black tracking-tight text-fg sm:text-4xl">
        Deals
      </h1>

      {needingReassignment.length > 0 ? (
        <section className="mt-8 rounded-panel border border-danger/30 bg-danger-soft p-5">
          <h2 className="font-display text-lg font-bold text-fg">
            Held by a suspended agent
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            These channels are still owned by an account that can no longer act
            on them. Nothing moves until somebody else takes them on.
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {needingReassignment.map((order) => (
              <li
                key={order.id}
                className="rounded-card border border-line bg-surface p-4"
              >
                <p className="text-sm font-semibold text-fg">
                  {order.listing.title}
                </p>
                <p className="mt-1 text-xs text-subtle">
                  {order.reference} · was {order.agent?.name} ({order.status})
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {isFinance && awaitingPayment.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-lg font-bold text-fg">
            Waiting on payment
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Until the Cryptomus webhook exists, a payment is recorded here by
            hand. Every later step of a deal unlocks behind it.
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {awaitingPayment.map((order) => (
              <li
                key={order.id}
                className="rounded-card border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-sm font-semibold text-fg">
                    {order.listing.title}
                  </p>
                  <p className="tnum text-xs text-subtle">{order.reference}</p>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {order.mode === "SAFEST" ? "Safest" : "Fastest"} · buyer owes{" "}
                  <Price usd={order.totalUsd / 100} className="text-fg" />
                </p>
                <RecordPayment orderId={order.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="font-display text-lg font-bold text-fg">
          Needs an agent
        </h2>
        {needingAgent.length === 0 ? (
          <p className="mt-1.5 text-sm text-muted">
            Nothing waiting. Every live deal has somebody on it.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {needingAgent.map((order) => (
              <li
                key={order.id}
                className="rounded-card border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-sm font-semibold text-fg">
                    {order.listing.title}
                  </p>
                  <p className="tnum text-xs text-subtle">{order.reference}</p>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {order.mode === "SAFEST" ? "Safest" : "Fastest"} ·{" "}
                  <Price usd={order.priceUsd / 100} className="text-fg" /> ·{" "}
                  {order.status}
                </p>
                {isAgent ? (
                  <ClaimDeal
                    orderId={order.id}
                    defaultEmail={viewer.email}
                    defaultBrand="Channel Adda Transfers"
                  />
                ) : (
                  <p className="mt-2 text-xs text-subtle">
                    An agent claims this from their own queue.
                  </p>
                )}
                <EndDeal orderId={order.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg font-bold text-fg">
          Everything that has happened
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Read from the audit trail, so it is the same record a dispute is
          settled from.
        </p>
        {activity.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No deal activity yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-line">
            {activity.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3"
              >
                <Badge className="text-subtle">{row.orderStatus}</Badge>
                <span className="text-sm text-fg">
                  {ACTION_LABELS[row.action] ?? row.action}
                </span>
                <Link
                  href={`/dashboard/deals/${row.orderId}`}
                  className="tnum text-xs text-primary-text underline"
                >
                  {row.orderReference}
                </Link>
                <span className="min-w-0 truncate text-xs text-muted">
                  {row.listingTitle}
                </span>
                <span className="ml-auto text-xs text-subtle">
                  {row.actorName ?? "Channel Adda"} ·{" "}
                  {row.createdAt.toLocaleString("en-GB")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
