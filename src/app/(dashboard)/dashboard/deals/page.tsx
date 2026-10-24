import {
  ChevronRightIcon,
  HandshakeIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  StoreIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Amount,
  EmptyState,
  FilterBar,
  FilterLink,
  IconTile,
  List,
  ListItem,
  PageHeader,
  Reference,
  Sep,
  TurnFlag,
} from "@/components/app/kit";
import {
  ACTOR_LABELS,
  dealHeadline,
  SIDE_LABELS,
  STATUS_TONE,
} from "@/components/deals/deal-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DEAL_TABS, type DealTab, dealTabs, openTab } from "@/lib/deal-tabs";
import type { DealListRow } from "@/server/deals";
import { listDealsFor } from "@/server/deals";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Deals",
  robots: { index: false, follow: false },
};

const SIDE_ICONS = {
  buyer: ShoppingBagIcon,
  seller: StoreIcon,
  agent: ShieldCheckIcon,
} as const;

/** The tabs' names, said as plainly as the rows below them. */
const TAB_LABEL: Record<DealTab, string> = {
  yours: "Your turn",
  running: "In progress",
  paused: "Paused",
  finished: "Finished",
};

const TAB_EMPTY: Record<DealTab, string> = {
  yours: "Nothing needs you right now.",
  running: "No deals in progress.",
  paused: "No deals are paused.",
  finished: "No finished deals yet.",
};

/**
 * Every deal, both sides in one list, in tabs by where it stands.
 *
 * Same reasoning as the inbox: everyone here buys and sells, so splitting
 * by buying and selling would hide half of what somebody is doing. The side
 * is a label on the row instead. The tabs answer the question somebody opens
 * this page with — is anything mine to do? — and the page opens on that tab
 * whenever it is not empty.
 */
export default async function DealsPage({
  searchParams,
}: PageProps<"/dashboard/deals">) {
  const user = await requireUser("/dashboard/deals");
  const [deals, params] = await Promise.all([
    listDealsFor(user.id),
    searchParams,
  ]);

  const tabs = dealTabs(deals);
  const counts = {
    yours: tabs.yours.length,
    running: tabs.running.length,
    paused: tabs.paused.length,
    finished: tabs.finished.length,
  };
  const asked = typeof params.tab === "string" ? params.tab : undefined;
  const tab = openTab(asked, counts);
  // Paused only shows while something is: a tab that is always empty is
  // one more word to read.
  const shown = DEAL_TABS.filter(
    (name) => name !== "paused" || counts.paused > 0 || tab === "paused",
  );
  const mine = counts.yours;

  return (
    <>
      {/* The one line on the page is the count that needs the reader; what
          the page is for sits behind the (i). */}
      <PageHeader
        title="Deals"
        description={
          mine > 0
            ? `${mine} of your ${deals.length} ${deals.length === 1 ? "deal" : "deals"} ${mine === 1 ? "needs" : "need"} something from you.`
            : undefined
        }
        info={
          deals.length === 0
            ? "The steps that move an account from its seller to its buyer, with Channel Adda in the middle."
            : "Everything in progress, on either side. Each row says who it is waiting on."
        }
        actions={
          deals.length > 0 ? (
            <Button asChild variant="secondary" size="md">
              <Link href="/browse">Browse accounts</Link>
            </Button>
          ) : undefined
        }
      />

      {deals.length === 0 ? (
        <EmptyState
          icon={HandshakeIcon}
          title="No deals yet"
          body="When you buy an account, or somebody buys one of yours, the handover runs here step by step."
          action={
            <Button asChild size="md">
              <Link href="/browse">Browse accounts for sale</Link>
            </Button>
          }
        />
      ) : (
        <>
          <FilterBar label="Deals by where they stand" className="mb-5">
            {shown.map((name) => (
              <FilterLink
                key={name}
                href={`/dashboard/deals?tab=${name}`}
                active={tab === name}
                count={counts[name]}
                tone={
                  name === "yours"
                    ? "primary"
                    : name === "paused"
                      ? "danger"
                      : "neutral"
                }
              >
                {TAB_LABEL[name]}
              </FilterLink>
            ))}
          </FilterBar>

          {tabs[tab].length > 0 ? (
            <DealRows deals={tabs[tab]} />
          ) : (
            <p className="rounded-card border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
              {TAB_EMPTY[tab]}
            </p>
          )}
        </>
      )}
    </>
  );
}

function DealRows({ deals }: { deals: DealListRow[] }) {
  return (
    <List>
      {deals.map((deal) => {
        const Icon = SIDE_ICONS[deal.side];
        // Frozen: the row still has a next actor, but nobody may act.
        const frozen = deal.status === "DISPUTED";
        const yourTurn =
          !frozen && deal.awaiting === deal.side && deal.waitingUntil === null;

        return (
          <ListItem key={deal.id} href={`/dashboard/deals/${deal.id}`}>
            <div className="flex items-start gap-3 sm:items-center">
              {/* The side is already in words on the meta line; the tile
                  only helps a wide list scan, so a phone keeps the room. */}
              <IconTile icon={Icon} className="hidden sm:inline-flex" />

              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm leading-5 font-medium text-fg">
                    {deal.listingTitle}
                  </p>
                  <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.8125rem] leading-5 text-muted">
                    <span className="min-w-0 truncate">
                      {SIDE_LABELS[deal.side]}{" "}
                      {deal.side === "agent" ? "for" : "with"}{" "}
                      {deal.otherSideName}
                    </span>
                    <Sep />
                    <span>{deal.mode === "SAFEST" ? "Safest" : "Fastest"}</span>
                    <Sep />
                    <Reference>{deal.reference}</Reference>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 sm:shrink-0 sm:justify-end">
                  <Badge variant={STATUS_TONE[deal.status]} size="sm">
                    {
                      dealHeadline(
                        deal.status,
                        deal.mode,
                        deal.side,
                        deal.openStep,
                        deal.platform,
                        deal.awaitingAgent,
                      ).short
                    }
                  </Badge>
                  {deal.waitingUntil && !frozen ? (
                    <span className="text-xs whitespace-nowrap text-subtle tabular-nums">
                      Opens{" "}
                      {deal.waitingUntil.toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  ) : deal.awaiting && !frozen ? (
                    <TurnFlag
                      mine={yourTurn}
                      who={ACTOR_LABELS[deal.awaiting]}
                    />
                  ) : null}
                </div>
              </div>

              <Amount
                cents={deal.priceUsd}
                caption="channel price"
                className="shrink-0 sm:w-28"
              />

              <ChevronRightIcon
                aria-hidden="true"
                className="hidden size-4 shrink-0 text-subtle transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-muted sm:block"
              />
            </div>
          </ListItem>
        );
      })}
    </List>
  );
}
