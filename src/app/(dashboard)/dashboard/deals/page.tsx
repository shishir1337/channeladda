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
  IconTile,
  List,
  ListItem,
  PageHeader,
  Reference,
  Section,
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

/**
 * Every deal, both sides in one list.
 *
 * Same reasoning as the inbox: everyone here buys and sells, so splitting
 * this into a buying tab and a selling tab would hide half of what somebody
 * is doing from them. The side is a label on the row instead.
 *
 * What the list *is* split by is whose turn it is, because that is the only
 * question somebody opens this page with. A flat list by date made a deal
 * that needs a payment today look exactly like one that needs nothing for a
 * week.
 */
export default async function DealsPage() {
  const user = await requireUser("/dashboard/deals");
  const deals = await listDealsFor(user.id);

  // A disputed deal still names a next actor, because staff resolve it on
  // rather than ending it. Nobody can act on it though, so it is its own
  // group instead of sitting under "Waiting on you" with a button nobody can
  // press.
  const paused = deals.filter((deal) => deal.status === "DISPUTED");
  const live = deals.filter((deal) => deal.status !== "DISPUTED");
  // A step behind a running hold is nobody's move until it ends, so it
  // waits with the others rather than under "Waiting on you".
  const mine = live.filter(
    (deal) => deal.awaiting === deal.side && deal.waitingUntil === null,
  );
  const theirs = live.filter(
    (deal) =>
      deal.awaiting !== null &&
      (deal.awaiting !== deal.side || deal.waitingUntil !== null),
  );
  const finished = live.filter((deal) => deal.awaiting === null);

  return (
    <>
      {/* The one line on the page is the count that needs the reader; what
          the page is for sits behind the (i). */}
      <PageHeader
        title="Deals"
        description={
          mine.length > 0
            ? `${mine.length} of your ${deals.length} ${deals.length === 1 ? "deal" : "deals"} ${mine.length === 1 ? "needs" : "need"} something from you.`
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
          {/* The only gold on the page is this count and the "Your move"
              flags: a deal waiting on the reader is found by its turn, not
              by a tinted row. */}
          {mine.length > 0 ? (
            <Section
              id="waiting-on-you"
              title="Waiting on you"
              count={mine.length}
              tone="primary"
              info="Nothing on these moves until you act."
            >
              <DealRows deals={mine} />
            </Section>
          ) : null}

          {paused.length > 0 ? (
            <Section
              id="paused"
              title="Paused with Channel Adda"
              count={paused.length}
              info="A moderator is reading the record. Nothing moves until they decide."
            >
              <DealRows deals={paused} />
            </Section>
          ) : null}

          {theirs.length > 0 ? (
            <Section
              id="with-the-other-side"
              title="With the other side"
              count={theirs.length}
              info="In progress. A deal moves up to “Waiting on you” when it is your turn."
            >
              <DealRows deals={theirs} />
            </Section>
          ) : null}

          {finished.length > 0 ? (
            <Section id="finished" title="Finished" count={finished.length}>
              <DealRows deals={finished} />
            </Section>
          ) : null}
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
