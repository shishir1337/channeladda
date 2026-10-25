import Link from "next/link";
import { DealHead, DealModeBadge } from "@/components/admin/vocab";
import { List, ListItem, Section } from "@/components/app/kit";
import { EndWaitNow } from "@/components/deals/deal-timeline";
import { db } from "@/lib/db";
import { TERMINAL_STATUSES } from "@/lib/deal-machine";
import { siteDayMonth } from "@/lib/site-time";

/**
 * Deals in their waiting period — Google's wait on Safest, the holding
 * period on Fastest — with the button to end one early.
 *
 * Google sometimes lets the transfer through before the date, and staff
 * were ending the wait from psql (the owner, 2026-10-24). Shown to the
 * moderators and the owner only, the people `endHoldNow` lets press it, and
 * not at all when nothing is waiting.
 */
export async function WaitingDeals() {
  const now = new Date();
  const deals = await db.order.findMany({
    where: {
      holdUntil: { gt: now },
      status: { notIn: [...TERMINAL_STATUSES, "DISPUTED"] },
    },
    orderBy: { holdUntil: "asc" },
    take: 50,
    select: {
      id: true,
      reference: true,
      mode: true,
      holdUntil: true,
      listing: { select: { title: true, platform: true } },
    },
  });
  if (deals.length === 0) return null;

  return (
    <Section
      id="waiting"
      title="In the waiting period"
      count={deals.length}
      info="Each one opens its next step on the date shown (India time). On YouTube, end a wait early only when Google already lets the transfer go ahead; elsewhere, only when the holding period can safely end early."
    >
      <List>
        {deals.map((order) => (
          <ListItem key={order.id}>
            <DealHead
              // The row holds a button, so only the title is the link.
              title={
                <Link
                  href={`/dashboard/deals/${order.id}`}
                  className="hover:underline hover:underline-offset-4"
                >
                  {order.listing.title}
                </Link>
              }
              reference={order.reference}
              tags={
                <>
                  <DealModeBadge mode={order.mode} />
                  <span className="text-xs text-muted tabular-nums">
                    opens{" "}
                    {order.holdUntil
                      ? siteDayMonth(order.holdUntil, "short")
                      : null}
                  </span>
                </>
              }
            />
            <EndWaitNow
              orderId={order.id}
              platform={order.listing.platform}
              mode={order.mode}
            />
          </ListItem>
        ))}
      </List>
    </Section>
  );
}
