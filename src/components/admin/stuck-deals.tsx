import {
  AllClear,
  Amount,
  ConsoleSection,
  RowHead,
  RowItem,
  Rows,
} from "@/components/admin/console";
import { EndDeal } from "@/components/admin/deal-controls";
import {
  DealModeBadge,
  elapsed,
  OrderStatusBadge,
  Waited,
} from "@/components/admin/vocab";
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
 * deal, and a deal hidden behind a filter is a deal nobody unsticks. What the
 * list does carry is severity — a disputed deal and a deal that has sat for a
 * week are marked, so "read all of it" and "start here" are both possible.
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

/** Days a deal may sit before the row is flagged. */
const STALE_DAYS = 7;
const AGEING_DAYS = 3;

export async function StuckDeals({
  canMoveMoney = false,
}: {
  canMoveMoney?: boolean;
}) {
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

  const disputed = deals.filter((d) => d.status === "DISPUTED").length;
  const stale = deals.filter(
    (d) => elapsed(d.createdAt).hours >= STALE_DAYS * 24,
  ).length;

  return (
    <ConsoleSection
      id="in-flight"
      title="Deals in flight"
      count={deals.length}
      tone={disputed > 0 || stale > 0 ? "danger" : "neutral"}
      description="Every live deal, oldest first. Nothing here times out on its own, so a deal that has sat for days is waiting on somebody reading this list."
      actions={
        deals.length > 0 ? (
          <p className="text-xs text-subtle">
            {disputed > 0 ? (
              <span className="font-semibold text-danger">
                {disputed} disputed
              </span>
            ) : (
              "none disputed"
            )}
            {" · "}
            {stale > 0 ? (
              <span className="font-semibold text-danger">
                {stale} over {STALE_DAYS} days
              </span>
            ) : (
              `none over ${STALE_DAYS} days`
            )}
          </p>
        ) : null
      }
    >
      {deals.length === 0 ? (
        <AllClear
          title="Nothing is in flight"
          body="Every deal on the platform has either finished or not started. There is nothing to unstick."
        />
      ) : (
        <Rows>
          {deals.map((order) => {
            const next = order.steps[0];
            const age = elapsed(order.createdAt);
            const flag =
              order.status === "DISPUTED" || age.hours >= STALE_DAYS * 24
                ? "danger"
                : age.hours >= AGEING_DAYS * 24
                  ? "primary"
                  : undefined;
            return (
              <RowItem key={order.id} flag={flag}>
                <div className="p-4 pl-5">
                  <RowHead
                    title={order.listing.title}
                    reference={order.reference}
                    tags={
                      <>
                        <DealModeBadge mode={order.mode} />
                        <OrderStatusBadge status={order.status} />
                        <Waited
                          since={order.createdAt}
                          prefix="open"
                          warnAfter={AGEING_DAYS * 24}
                          lateAfter={STALE_DAYS * 24}
                        />
                      </>
                    }
                    right={
                      <Amount
                        cents={order.priceUsd}
                        caption={
                          order.mode === "SAFEST"
                            ? "paid off-platform"
                            : "we hold this"
                        }
                      />
                    }
                  />
                  <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                    <div className="flex gap-1.5">
                      <dt className="text-subtle">Agent</dt>
                      <dd
                        className={
                          order.agent ? "text-fg" : "font-medium text-danger"
                        }
                      >
                        {order.agent?.name ?? "nobody"}
                      </dd>
                    </div>
                    {next ? (
                      <div className="flex min-w-0 gap-1.5">
                        <dt className="shrink-0 text-subtle">
                          Step {next.position}, waiting on {next.actor}
                        </dt>
                        <dd className="min-w-0 truncate text-fg">
                          {next.label}
                        </dd>
                      </div>
                    ) : (
                      <div className="flex gap-1.5">
                        <dt className="text-subtle">Next step</dt>
                        <dd className="text-fg">
                          none outstanding on the template
                        </dd>
                      </div>
                    )}
                  </dl>
                  <EndDeal
                    orderId={order.id}
                    mode={order.mode}
                    status={order.status}
                    canMoveMoney={canMoveMoney}
                  />
                </div>
              </RowItem>
            );
          })}
        </Rows>
      )}
    </ConsoleSection>
  );
}
