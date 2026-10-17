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
  PageHead,
  Row,
  Rows,
  Section,
  TurnFlag,
} from "@/components/dashboard/page-parts";
import {
  ACTOR_LABELS,
  SIDE_LABELS,
  STATUS_SHORT,
  STATUS_TONE,
} from "@/components/deals/deal-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Price } from "@/components/ui/price";
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
  const mine = live.filter((deal) => deal.awaiting === deal.side);
  const theirs = live.filter(
    (deal) => deal.awaiting !== null && deal.awaiting !== deal.side,
  );
  const finished = live.filter((deal) => deal.awaiting === null);

  return (
    <>
      <PageHead
        title="Deals"
        description={
          deals.length === 0
            ? "A deal is the handover itself: the steps that move an account from its seller to its buyer, with Channel Adda in the middle."
            : mine.length > 0
              ? `${mine.length} of your ${deals.length} ${deals.length === 1 ? "deal" : "deals"} ${mine.length === 1 ? "needs" : "need"} something from you. A deal moves one step at a time.`
              : "Everything in progress, on either side. A deal moves one step at a time, and each row says who it is waiting on."
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
        <Section>
          <EmptyState
            icon={HandshakeIcon}
            title="No deals yet"
            description="When you buy an account, or somebody buys one of yours, the handover runs here step by step — who has the account, who has been paid, and what is needed from you next."
            action={
              <Button asChild size="md">
                <Link href="/browse">Browse accounts for sale</Link>
              </Button>
            }
          />
        </Section>
      ) : (
        <>
          {mine.length > 0 ? (
            <Section
              title="Waiting on you"
              description="Nothing on these moves until you act."
            >
              <DealRows deals={mine} />
            </Section>
          ) : null}

          {paused.length > 0 ? (
            <Section
              title="Paused with Channel Adda"
              description="A moderator is reading the record. Nothing moves until they decide."
            >
              <DealRows deals={paused} />
            </Section>
          ) : null}

          {theirs.length > 0 ? (
            <Section
              title="With the other side"
              description="In progress. A deal moves up to “Waiting on you” when it is your turn."
            >
              <DealRows deals={theirs} />
            </Section>
          ) : null}

          {finished.length > 0 ? (
            <Section title="Finished">
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
    <Rows>
      {deals.map((deal) => {
        const Icon = SIDE_ICONS[deal.side];
        // Frozen: the row still has a next actor, but nobody may act.
        const frozen = deal.status === "DISPUTED";
        const yourTurn = !frozen && deal.awaiting === deal.side;

        return (
          <Row key={deal.id}>
            <Link
              href={`/dashboard/deals/${deal.id}`}
              className="flex items-start gap-3.5 p-4 transition-colors duration-200 hover:bg-surface-2 sm:p-5"
            >
              <span
                aria-hidden="true"
                className={
                  yourTurn
                    ? "mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-text"
                    : "mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-subtle"
                }
              >
                <Icon className="size-[1.15rem]" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="min-w-0 truncate text-[0.9375rem] font-semibold text-fg">
                    {deal.listingTitle}
                  </span>
                  <span className="shrink-0 text-right">
                    <Price
                      usd={deal.priceUsd / 100}
                      className="text-[0.9375rem] font-semibold text-fg"
                    />
                    <span className="block text-[0.625rem] tracking-wide text-subtle uppercase">
                      channel price
                    </span>
                  </span>
                </span>

                <span className="mt-1 block truncate text-xs text-subtle">
                  {SIDE_LABELS[deal.side]}{" "}
                  {deal.side === "agent" ? "for" : "with"} {deal.otherSideName}{" "}
                  · {deal.mode === "SAFEST" ? "Safest" : "Fastest"} ·{" "}
                  <span className="tnum">{deal.reference}</span>
                </span>

                <span className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <Badge variant={STATUS_TONE[deal.status]} size="sm">
                    {STATUS_SHORT[deal.status]}
                  </Badge>
                  {deal.awaiting && !frozen ? (
                    <TurnFlag
                      mine={yourTurn}
                      who={ACTOR_LABELS[deal.awaiting]}
                    />
                  ) : null}
                </span>
              </span>

              <ChevronRightIcon
                aria-hidden="true"
                className="mt-2 hidden size-4 shrink-0 text-subtle sm:block"
              />
            </Link>
          </Row>
        );
      })}
    </Rows>
  );
}
