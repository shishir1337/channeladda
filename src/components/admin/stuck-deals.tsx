import { EndDeal } from "@/components/admin/deal-controls";
import { Price } from "@/components/ui/price";
import { db } from "@/lib/db";

/**
 * Every deal still in flight, with the lever to end it.
 *
 * The claim queue only lists deals with no agent, so until this existed the
 * deals that actually get stuck — mid-custody, waiting on a buyer who has
 * stopped answering, or blocked on a second approval — had no control
 * anywhere in the product. Staff could watch them and nothing else.
 *
 * Deliberately a flat list rather than a filtered view: there is no scheduler
 * yet, so a human reading down this list is the only thing that unsticks a
 * deal, and a deal hidden behind a filter is a deal nobody unsticks.
 */
const LIVE_STATUSES = [
  "AWAITING_PAYMENT",
  "AGENT_VERIFYING",
  "AWAITING_CUSTODY",
  "IN_CUSTODY",
  "AWAITING_BUYER_PAYMENT",
  "AWAITING_HANDOVER",
  "AWAITING_RELEASE",
  "DISPUTED",
] as const;

export async function StuckDeals() {
  const deals = await db.order.findMany({
    where: { status: { in: [...LIVE_STATUSES] } },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: {
      id: true,
      reference: true,
      mode: true,
      status: true,
      priceUsd: true,
      createdAt: true,
      agent: { select: { name: true } },
      listing: { select: { title: true } },
      steps: {
        where: { completedAt: null },
        orderBy: { position: "asc" },
        take: 1,
        select: { position: true, label: true, actor: true },
      },
    },
  });

  if (deals.length === 0) return null;

  const days = (from: Date) =>
    Math.floor((Date.now() - from.getTime()) / 86_400_000);

  return (
    <section className="mt-10">
      <h2 className="font-display text-lg font-bold text-fg">
        Deals in flight
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        Every live deal, oldest first, with the controls to end one. Nothing
        here times out on its own yet, so a deal that has sat for days is
        waiting on somebody reading this list.
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {deals.map((order) => {
          const next = order.steps[0];
          const age = days(order.createdAt);
          return (
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
                {order.agent ? ` · ${order.agent.name}` : " · no agent"}
                {age > 0 ? ` · opened ${age}d ago` : null}
              </p>
              {next ? (
                <p className="mt-1 text-xs text-subtle">
                  Waiting on {next.actor}: {next.label}
                </p>
              ) : null}
              <EndDeal orderId={order.id} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
