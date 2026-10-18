import {
  ArrowUpRightIcon,
  CompassIcon,
  EyeIcon,
  FingerprintIcon,
  HandshakeIcon,
  MailWarningIcon,
  PlusIcon,
  StoreIcon,
  TimerIcon,
  TriangleAlertIcon,
  WalletIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { InfoTip } from "@/components/app/info-tip";
import {
  AllClear,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  IconTile,
  List,
  ListItem,
  ListRow,
  PageHeader,
  Section,
  SeeAll,
  Sep,
  SplitBar,
  Stat,
  StatGrid,
} from "@/components/app/kit";
import { statusMeta } from "@/components/dashboard/listing-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import type { ListingStatus, OfferStatus } from "@/generated/prisma/enums";
import { getBuyerSummary, getSellerSummary } from "@/server/dashboard";
import { getOffersForBuyer, getOffersForSeller } from "@/server/offers";
import { getMyListings } from "@/server/seller-listings";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Overview",
  robots: { index: false, follow: false },
};

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/** First name only. Nobody is greeted by their full legal name. */
function firstNameOf(name: string) {
  return name.split(/\s+/)[0];
}

/**
 * How long something has been sitting there, in words.
 *
 * Dates are the wrong unit for a queue: "18 Sep" makes a reader do arithmetic
 * before they know whether it is urgent, and half the people here are not
 * reading in their first language.
 */
function howLong(since: Date, now: Date) {
  const hours = Math.floor((now.getTime() - since.getTime()) / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `Waiting ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Waiting since yesterday";
  return `Waiting ${days} days`;
}

function ago(at: Date, now: Date) {
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 31) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "last month" : `${months} months ago`;
}

/** One thing that will not move until this person does something. */
type Task = {
  id: string;
  href: string;
  icon: Icon;
  what: ReactNode;
  detail: string;
  cta: string;
  since: Date;
};

/** Something that already happened, said in a whole sentence. */
type Event = {
  id: string;
  href: string;
  icon: Icon;
  what: ReactNode;
  detail: string;
  outcome: string | null;
  at: Date;
};

const OFFER_OUTCOME: Record<OfferStatus, string | null> = {
  OPEN: null,
  ACCEPTED: "Accepted",
  REJECTED: "Declined",
  COUNTERED: "Countered",
  EXPIRED: "Expired",
  WITHDRAWN: "Withdrawn",
};

/** What each listing state looks like as a thing that happened. */
const LISTING_EVENT: Record<ListingStatus, string> = {
  DRAFT: "You saved a draft",
  CODE_CHECK: "We asked for your ownership code",
  ADMIN_REVIEW: "You sent a listing to us for checking",
  LIVE: "Your listing went live",
  RESERVED: "A buyer reserved your listing",
  SOLD: "Your listing sold",
  REJECTED: "A reviewer asked for changes",
  PAUSED: "You paused a listing",
  REMOVED: "A listing was taken down",
};

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");

  const [selling, buying, received, made, listings] = await Promise.all([
    getSellerSummary(user.id),
    getBuyerSummary(user.id),
    getOffersForSeller(user.id),
    getOffersForBuyer(user.id),
    getMyListings(user.id),
  ]);

  const now = new Date();

  /**
   * The page leads with whose turn it is rather than with totals.
   *
   * Everything here is turn-taking — an offer, a code to place, a rejection to
   * answer — and a dashboard that opens with lifetime volume buries the one
   * thing a person actually came to do.
   */
  const tasks: Task[] = [
    ...received
      .filter((offer) => offer.awaiting === "seller")
      .map((offer) => ({
        id: `offer-in-${offer.id}`,
        href: "/dashboard/offers",
        icon: HandshakeIcon,
        what: (
          <>
            Answer {firstNameOf(offer.buyerName)}&rsquo;s offer of{" "}
            <Price usd={offer.amount} className="font-semibold" />
          </>
        ),
        detail: offer.listingHandle,
        cta: "Answer it",
        since: offer.createdAt,
      })),
    ...made
      .filter((offer) => offer.awaiting === "buyer")
      .map((offer) => ({
        id: `offer-out-${offer.id}`,
        href: "/dashboard/offers",
        icon: HandshakeIcon,
        what: (
          <>
            Answer the seller&rsquo;s counter of{" "}
            <Price usd={offer.amount} className="font-semibold" />
          </>
        ),
        detail: offer.listingHandle,
        cta: "Answer it",
        since: offer.createdAt,
      })),
    ...listings
      .filter((listing) => listing.status === "CODE_CHECK")
      .map((listing) => ({
        id: `code-${listing.id}`,
        href: `/dashboard/listings/${listing.id}`,
        icon: FingerprintIcon,
        what: <>Put the ownership code on your profile</>,
        detail: `${listing.handle} — this proves the account is yours`,
        cta: "Show me the code",
        since: listing.updatedAt,
      })),
    ...listings
      .filter((listing) => listing.status === "REJECTED")
      .map((listing) => ({
        id: `fix-${listing.id}`,
        href: `/dashboard/listings/${listing.id}`,
        icon: TriangleAlertIcon,
        what: <>Fix what the review asked for</>,
        detail: `${listing.handle} — then send it back to us`,
        cta: "Open the listing",
        since: listing.updatedAt,
      })),
  ].sort((a, b) => a.since.getTime() - b.since.getTime());

  /**
   * Recent activity, built from what the page already has in hand.
   *
   * Anything still waiting on this person is left out: it is already at the
   * top of the page, and a feed that repeats the to-do list makes both halves
   * easier to ignore.
   */
  const events: Event[] = [
    ...received.map((offer) => ({
      id: `r-${offer.id}`,
      href: "/dashboard/offers",
      icon: HandshakeIcon,
      what: offer.bySeller ? (
        <>
          You countered at{" "}
          <Price usd={offer.amount} className="font-semibold" />
        </>
      ) : (
        <>
          {firstNameOf(offer.buyerName)} offered{" "}
          <Price usd={offer.amount} className="font-semibold" />
        </>
      ),
      detail: offer.listingHandle,
      outcome: OFFER_OUTCOME[offer.effectiveStatus],
      at: offer.respondedAt ?? offer.createdAt,
      skip: offer.awaiting === "seller",
    })),
    ...made.map((offer) => ({
      id: `m-${offer.id}`,
      href: "/dashboard/offers",
      icon: HandshakeIcon,
      what: offer.bySeller ? (
        <>
          The seller countered at{" "}
          <Price usd={offer.amount} className="font-semibold" />
        </>
      ) : (
        <>
          You offered <Price usd={offer.amount} className="font-semibold" />
        </>
      ),
      detail: offer.listingHandle,
      outcome: OFFER_OUTCOME[offer.effectiveStatus],
      at: offer.respondedAt ?? offer.createdAt,
      skip: offer.awaiting === "buyer",
    })),
    ...listings.map((listing) => ({
      id: `l-${listing.id}`,
      href: `/dashboard/listings/${listing.id}`,
      icon: StoreIcon,
      what: <>{LISTING_EVENT[listing.status]}</>,
      detail: listing.handle,
      outcome: statusMeta(listing.status).label,
      at: listing.updatedAt,
      skip: listing.status === "CODE_CHECK" || listing.status === "REJECTED",
    })),
  ]
    .filter((event) => !event.skip)
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 6);

  const neverSold = listings.length === 0;
  const neverBought = made.length === 0 && buying.bought === 0;
  const brandNew = neverSold && neverBought && tasks.length === 0;

  // One gold button per screen, on whatever is actually next. An unconfirmed
  // email outranks everything (nothing can be bought or sold until it is
  // done), then the first-visit card, then anything waiting in the list —
  // and only when none of those is on the page is listing the next move.
  const listIsNext = user.emailVerified && tasks.length === 0 && !brandNew;

  const listButton = (variant: "primary" | "secondary") => (
    <Button asChild size="md" variant={variant}>
      <Link href="/dashboard/listings/new">
        <PlusIcon aria-hidden="true" />
        List an account
      </Link>
    </Button>
  );

  return (
    <>
      {/* A greeting and, only when something is waiting, one line on it.
          The other states said again what the page says just below — the
          all-clear line, and the live and watching figures under Selling. */}
      <PageHeader
        title={`Hello, ${firstNameOf(user.name)}`}
        description={
          tasks.length > 0
            ? `${tasks.length} ${tasks.length === 1 ? "thing needs" : "things need"} you. Everything else can wait.`
            : undefined
        }
        actions={listButton(listIsNext ? "primary" : "secondary")}
      />

      {!user.emailVerified ? (
        <Section>
          <Callout
            tone="warning"
            icon={MailWarningIcon}
            title="Confirm your email address"
            action={
              <Button asChild size="sm">
                <Link href="/verify-email">Confirm email</Link>
              </Button>
            }
          >
            You can look around without it, but buying and selling stay locked
            until the address is confirmed.
          </Callout>
        </Section>
      ) : null}

      {/* ---- whose turn it is -------------------------------------------- */}
      {tasks.length === 0 ? (
        <Section>
          <AllClear
            title={
              <>
                You are all caught up
                <InfoTip label="About being caught up" className="ml-1.5">
                  Nothing is waiting on you right now. The moment something is,
                  it appears here and in the menu.
                </InfoTip>
              </>
            }
          />
        </Section>
      ) : (
        <Section
          id="waiting-on-you"
          title="Waiting on you"
          count={tasks.length}
          tone="primary"
        >
          <List>
            {tasks.slice(0, 5).map((task) => (
              <ListItem key={task.id} href={task.href}>
                <ListRow
                  leading={<IconTile icon={task.icon} />}
                  // The title wraps rather than truncating: it carries the
                  // amount, and an offer cut off before its price is no use.
                  title={<span className="whitespace-normal">{task.what}</span>}
                  meta={
                    <>
                      <span className="min-w-0 truncate">{task.detail}</span>
                      <Sep />
                      <span className="shrink-0 tabular-nums">
                        {howLong(task.since, now)}
                      </span>
                    </>
                  }
                  trailing={
                    <span className="hidden text-[0.8125rem] font-medium text-muted transition-colors duration-150 group-hover:text-fg sm:inline">
                      {task.cta}
                    </span>
                  }
                  chevron
                />
              </ListItem>
            ))}
            {tasks.length > 5 ? (
              <ListItem className="bg-surface-2/50 py-2.5 text-[0.8125rem] text-muted">
                And {tasks.length - 5} more, over in{" "}
                <Link
                  href="/dashboard/offers"
                  className="font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:decoration-fg"
                >
                  Offers
                </Link>{" "}
                and{" "}
                <Link
                  href="/dashboard/listings"
                  className="font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:decoration-fg"
                >
                  Your listings
                </Link>
                .
              </ListItem>
            ) : null}
          </List>
        </Section>
      )}

      {/* ---- money ------------------------------------------------------- */}
      <Section
        title="Your money"
        info={
          <>
            <p>Lifetime totals. Your spendable balance lives in the wallet.</p>
            <p className="mt-1.5">
              On a Safest deal the buyer pays you directly, so that money is
              counted above but never passes through Channel Adda. Only Fastest
              sales reach your balance.
            </p>
          </>
        }
      >
        {/* One per row on a phone: these are lifetime money figures, and in
            a wide currency a large one does not fit a half-width card. */}
        <StatGrid columns={3} className="grid-cols-1 sm:grid-cols-2">
          <Stat
            label="Earned from sales"
            value={<Price usd={selling.earned} />}
            note={
              selling.sold > 0
                ? `After our fee, across ${selling.sold} ${selling.sold === 1 ? "sale" : "sales"}.`
                : "Nothing sold yet."
            }
            tone={selling.earned > 0 ? "verified" : "neutral"}
          />
          <Stat
            label="Spent on purchases"
            value={<Price usd={buying.spent} />}
            note={
              buying.bought > 0
                ? `Including fees, across ${buying.bought} ${buying.bought === 1 ? "purchase" : "purchases"}.`
                : "Nothing bought yet."
            }
          />
          <WalletDoor />
        </StatGrid>
      </Section>

      {/* ---- the two sides of the desk ----------------------------------- */}
      <Section>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              as="h2"
              icon={StoreIcon}
              title="Selling"
              info={
                neverSold ? undefined : (
                  <InfoRows
                    rows={[
                      ["Live for buyers to see"],
                      ["Being checked by us", "Nothing needed from you"],
                      ["Drafts not sent yet", "Only you can see these"],
                    ]}
                  />
                )
              }
              actions={<SeeAll href="/dashboard/listings">All listings</SeeAll>}
            />
            {neverSold ? (
              <EmptyState
                bare
                icon={StoreIcon}
                title="No listings yet"
                body="It is free to list, and nothing goes in front of buyers until we have checked it."
                action={
                  <Button asChild size="sm" variant="secondary">
                    <Link href="/dashboard/listings/new">List an account</Link>
                  </Button>
                }
                className="py-8"
              />
            ) : (
              <CardBody>
                <SplitBar
                  label="Your listings: live, in review and drafts"
                  parts={[
                    { label: "Live", value: selling.live, tone: "verified" },
                    {
                      label: "In review",
                      value: selling.inReview,
                      tone: "info",
                    },
                    { label: "Drafts", value: selling.drafts, tone: "muted" },
                  ]}
                />
                {selling.watching > 0 ? (
                  <p className="mt-4 flex items-center gap-1.5 text-[0.8125rem] leading-5 text-muted">
                    <EyeIcon
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-subtle"
                    />
                    <span className="tabular-nums">
                      {selling.watching.toLocaleString("en-US")}{" "}
                      {selling.watching === 1 ? "person is" : "people are"}{" "}
                      watching
                    </span>
                  </p>
                ) : null}
              </CardBody>
            )}
          </Card>

          <Card>
            <CardHeader
              as="h2"
              icon={HandshakeIcon}
              title="Buying"
              info={
                neverBought ? undefined : (
                  <InfoRows
                    rows={[
                      ["Offers still open", "Waiting on the seller"],
                      ["Offers accepted", "The account is held for you"],
                      ["Accounts bought", "Transfer finished"],
                    ]}
                  />
                )
              }
              actions={<SeeAll href="/dashboard/offers">All offers</SeeAll>}
            />
            {neverBought ? (
              <EmptyState
                bare
                icon={CompassIcon}
                title="No offers yet"
                body="Offers cost nothing, and the seller has two days to answer."
                action={
                  <Button asChild size="sm" variant="secondary">
                    <Link href="/browse">Browse accounts</Link>
                  </Button>
                }
                className="py-8"
              />
            ) : (
              <CardBody>
                <SplitBar
                  label="Your offers: open, accepted and bought"
                  parts={[
                    { label: "Open", value: buying.openOffers, tone: "info" },
                    {
                      label: "Accepted",
                      value: buying.accepted,
                      tone: "verified",
                    },
                    { label: "Bought", value: buying.bought },
                  ]}
                />
              </CardBody>
            )}
          </Card>
        </div>
      </Section>

      {/* ---- what happened lately ----------------------------------------
          Left out entirely on a brand-new account: the block underneath
          already says what to do first, and two empty states in a row teach
          a newcomer nothing except that the product is empty. */}
      {brandNew ? null : (
        <Section title="Recent activity">
          {events.length === 0 ? (
            <EmptyState
              icon={TimerIcon}
              title="Nothing recent"
              body="Offers, reviews and transfers all appear here as they happen."
              action={
                <Button asChild size="sm" variant="secondary">
                  <Link href="/browse">Browse accounts</Link>
                </Button>
              }
            />
          ) : (
            <List>
              {events.map((event) => (
                <ListItem key={event.id} href={event.href}>
                  <ListRow
                    leading={<IconTile icon={event.icon} />}
                    title={
                      <span className="whitespace-normal">{event.what}</span>
                    }
                    meta={
                      <>
                        <span className="min-w-0 truncate">{event.detail}</span>
                        <Sep />
                        <span className="shrink-0">{ago(event.at, now)}</span>
                      </>
                    }
                    trailing={
                      event.outcome ? (
                        <Badge size="sm">{event.outcome}</Badge>
                      ) : null
                    }
                    chevron
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Section>
      )}

      {/* ---- the very first visit ---------------------------------------- */}
      {brandNew ? (
        <Section>
          <EmptyState
            icon={CompassIcon}
            title="Two ways to start"
            body="List an account you own, or make an offer on one you want. An agent from Channel Adda sits in the middle of every deal, so neither side has to trust a stranger."
            action={
              <>
                {listButton(user.emailVerified ? "primary" : "secondary")}
                <Button asChild variant="secondary" size="md">
                  <Link href="/browse">Browse accounts</Link>
                </Button>
              </>
            }
            className="py-14"
          />
        </Section>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces of this page only
 * ------------------------------------------------------------------ */

/**
 * The wallet, as a door rather than a figure.
 *
 * The balance is not loaded on this page, so this card does not pretend to
 * show one; it matches the stats beside it so the row reads as one band, and
 * where the stats sit two-up it takes the whole row instead of sitting alone
 * at half width.
 *
 * What is in the wallet sits behind an (i). A button cannot go inside a link,
 * so — as `Stat` does — the tip floats over the card, just left of its arrow.
 */
function WalletDoor() {
  return (
    <div className="relative min-w-0 sm:col-span-2 lg:col-span-1">
      <Link
        href="/dashboard/wallet"
        className="group flex h-full min-w-0 flex-col rounded-card border border-line bg-surface p-4 shadow-xs transition-[border-color,background-color] duration-150 hover:border-line-strong hover:bg-surface-2/40"
      >
        <span className="flex items-center gap-2 text-[0.8125rem] leading-5 font-medium text-muted">
          <WalletIcon
            aria-hidden="true"
            className="size-3.5 shrink-0 text-subtle"
          />
          Wallet
          <ArrowUpRightIcon
            aria-hidden="true"
            className="ml-auto size-3.5 shrink-0 text-subtle opacity-60 transition duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-fg group-hover:opacity-100"
          />
        </span>
        <span className="mt-2 text-[0.9375rem] leading-6 font-semibold text-fg">
          Open your wallet
        </span>
      </Link>
      <InfoTip label="About Wallet" className="absolute top-4 right-9">
        Balance, adding funds, withdrawing, and every movement explained.
      </InfoTip>
    </div>
  );
}

/**
 * What each part of a card's bar means, for its (i): the name the part had
 * before it became a bar segment, and what it asks of the reader.
 */
function InfoRows({ rows }: { rows: [string, string?][] }) {
  return (
    <ul className="flex flex-col gap-1">
      {rows.map(([label, note]) => (
        <li key={label}>
          <span className="font-medium text-fg">{label}</span>
          {note ? <> — {note}</> : null}
        </li>
      ))}
    </ul>
  );
}
