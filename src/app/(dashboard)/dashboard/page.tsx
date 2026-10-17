import {
  ArrowRightIcon,
  CheckCircle2Icon,
  ClockIcon,
  CompassIcon,
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
import { statusMeta } from "@/components/dashboard/listing-status";
import { PageHead, Section } from "@/components/dashboard/page-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import type { ListingStatus, OfferStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
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

  const listButton = (
    <Button asChild size="md">
      <Link href="/dashboard/listings/new">
        <PlusIcon aria-hidden="true" className="size-4" />
        List an account
      </Link>
    </Button>
  );

  return (
    <>
      <PageHead
        title={`Hello, ${firstNameOf(user.name)}`}
        description={
          tasks.length > 0
            ? `${tasks.length} ${tasks.length === 1 ? "thing needs" : "things need"} you. Everything else can wait.`
            : selling.live > 0
              ? `${selling.live} listing${selling.live === 1 ? "" : "s"} live, ${selling.watching.toLocaleString("en-US")} ${selling.watching === 1 ? "person" : "people"} watching.`
              : "Nothing needs you. Here is where everything stands."
        }
        actions={listButton}
      />

      {!user.emailVerified ? (
        <Section>
          <div className="flex flex-col gap-4 rounded-panel border border-primary/35 bg-primary-soft p-4 sm:flex-row sm:items-center sm:p-5">
            <MailWarningIcon
              aria-hidden="true"
              className="size-6 shrink-0 text-primary-text"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">
                Confirm your email address
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                You can look around without it, but buying and selling stay
                locked until the address is confirmed.
              </p>
            </div>
            <Button asChild size="sm" className="shrink-0">
              <Link href="/verify-email">Confirm email</Link>
            </Button>
          </div>
        </Section>
      ) : null}

      {/* ---- whose turn it is -------------------------------------------- */}
      {tasks.length === 0 ? (
        <Section>
          <div className="flex flex-col gap-4 rounded-panel border border-verified/30 bg-verified-soft p-5 sm:flex-row sm:items-center sm:p-6">
            <CheckCircle2Icon
              aria-hidden="true"
              className="size-7 shrink-0 text-verified"
            />
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-base font-bold text-fg">
                You are all caught up
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Nothing is waiting on you right now. The moment something is, it
                appears here and in the menu.
              </p>
            </div>
          </div>
        </Section>
      ) : (
        <Section>
          <div className="overflow-hidden rounded-panel border border-primary/40 bg-surface shadow-soft">
            <div className="flex items-center gap-3 border-b border-primary/25 bg-primary-soft px-4 py-3.5 sm:px-5">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 animate-pulse-dot rounded-full bg-primary"
              />
              <h2 className="font-display text-base font-bold text-fg">
                Waiting on you
              </h2>
              <span className="tnum ml-auto shrink-0 rounded-full border border-primary/30 bg-surface px-2.5 py-1 text-xs font-bold text-primary-text">
                {tasks.length}
                <span className="sr-only"> things</span>
              </span>
            </div>

            <ul>
              {tasks.slice(0, 5).map((task) => (
                <li
                  key={task.id}
                  className="border-t border-line first:border-t-0"
                >
                  <Link
                    href={task.href}
                    className="flex items-start gap-3.5 p-4 transition-colors hover:bg-surface-2 sm:px-5"
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-text"
                    >
                      <task.icon className="size-[1.1rem]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-fg sm:text-[0.9375rem]">
                        {task.what}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle">
                        <span className="min-w-0 truncate">{task.detail}</span>
                        <span aria-hidden="true">&middot;</span>
                        <span className="inline-flex shrink-0 items-center gap-1">
                          <ClockIcon aria-hidden="true" className="size-3" />
                          {howLong(task.since, now)}
                        </span>
                      </span>
                    </span>
                    <span className="hidden shrink-0 items-center gap-1.5 self-center text-xs font-semibold text-primary-text sm:inline-flex">
                      {task.cta}
                      <ArrowRightIcon aria-hidden="true" className="size-3.5" />
                    </span>
                    <ArrowRightIcon
                      aria-hidden="true"
                      className="mt-2 size-4 shrink-0 text-subtle sm:hidden"
                    />
                  </Link>
                </li>
              ))}
            </ul>

            {tasks.length > 5 ? (
              <p className="border-t border-line bg-surface-2 px-4 py-3 text-xs text-muted sm:px-5">
                And {tasks.length - 5} more, over in{" "}
                <Link
                  href="/dashboard/offers"
                  className="font-medium text-primary-text underline-offset-4 hover:underline"
                >
                  Offers
                </Link>{" "}
                and{" "}
                <Link
                  href="/dashboard/listings"
                  className="font-medium text-primary-text underline-offset-4 hover:underline"
                >
                  Your listings
                </Link>
                .
              </p>
            ) : null}
          </div>
        </Section>
      )}

      {/* ---- money ------------------------------------------------------- */}
      <Section
        title="Your money"
        description="Lifetime totals. Your spendable balance lives in the wallet."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MoneyCard
            label="Earned from sales"
            value={<Price usd={selling.earned} />}
            note={
              selling.sold > 0
                ? `After our fee, across ${selling.sold} ${selling.sold === 1 ? "sale" : "sales"}.`
                : "Nothing sold yet."
            }
            tone={selling.earned > 0 ? "verified" : "neutral"}
          />
          <MoneyCard
            label="Spent on purchases"
            value={<Price usd={buying.spent} />}
            note={
              buying.bought > 0
                ? `Including fees, across ${buying.bought} ${buying.bought === 1 ? "purchase" : "purchases"}.`
                : "Nothing bought yet."
            }
          />
          <Link
            href="/dashboard/wallet"
            className="group flex items-center gap-4 rounded-panel border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-surface-2 sm:p-5"
          >
            <span
              aria-hidden="true"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-primary-text group-hover:bg-surface-3"
            >
              <WalletIcon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-fg">
                Open your wallet
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-subtle">
                Balance, adding funds, withdrawing, and every movement
                explained.
              </span>
            </span>
            <ArrowRightIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-subtle"
            />
          </Link>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-subtle">
          On a Safest deal the buyer pays you directly, so that money is counted
          above but never passes through Channel Adda. Only Fastest sales reach
          your balance.
        </p>
      </Section>

      {/* ---- the two sides of the desk ----------------------------------- */}
      <Section>
        <div className="grid gap-4 lg:grid-cols-2">
          <SidePanel
            icon={StoreIcon}
            title="Selling"
            href="/dashboard/listings"
            hrefLabel="All listings"
          >
            {neverSold ? (
              <InlineEmpty
                icon={StoreIcon}
                body="You have not listed an account yet. It is free to list, and nothing goes in front of buyers until we have checked it."
                action={
                  <Button asChild size="sm" variant="secondary">
                    <Link href="/dashboard/listings/new">List an account</Link>
                  </Button>
                }
              />
            ) : (
              <StatRows
                rows={[
                  {
                    label: "Live for buyers to see",
                    value: selling.live,
                    note:
                      selling.watching > 0
                        ? `${selling.watching.toLocaleString("en-US")} ${selling.watching === 1 ? "person is" : "people are"} watching`
                        : undefined,
                    tone: "verified",
                  },
                  {
                    label: "Being checked by us",
                    value: selling.inReview,
                    note: "Nothing needed from you",
                    tone: "info",
                  },
                  {
                    label: "Drafts not sent yet",
                    value: selling.drafts,
                    note: "Only you can see these",
                  },
                ]}
              />
            )}
          </SidePanel>

          <SidePanel
            icon={HandshakeIcon}
            title="Buying"
            href="/dashboard/offers"
            hrefLabel="All offers"
          >
            {neverBought ? (
              <InlineEmpty
                icon={CompassIcon}
                body="You have not made an offer yet. Offers cost nothing, and the seller has two days to answer."
                action={
                  <Button asChild size="sm" variant="secondary">
                    <Link href="/browse">Browse accounts</Link>
                  </Button>
                }
              />
            ) : (
              <StatRows
                rows={[
                  {
                    label: "Offers still open",
                    value: buying.openOffers,
                    note: "Waiting on the seller",
                  },
                  {
                    label: "Offers accepted",
                    value: buying.accepted,
                    note: "The account is held for you",
                    tone: "verified",
                  },
                  {
                    label: "Accounts bought",
                    value: buying.bought,
                    note: "Transfer finished",
                  },
                ]}
              />
            )}
          </SidePanel>
        </div>
      </Section>

      {/* ---- what happened lately ----------------------------------------
          Left out entirely on a brand-new account: the block underneath
          already says what to do first, and two empty states in a row teach
          a newcomer nothing except that the product is empty. */}
      {brandNew ? null : (
        <Section title="Recent activity">
          {events.length === 0 ? (
            <InlineEmpty
              icon={TimerIcon}
              body="Nothing recent. Offers, reviews and transfers all appear here as they happen."
              action={
                <Button asChild size="sm" variant="secondary">
                  <Link href="/browse">Browse accounts</Link>
                </Button>
              }
              boxed
            />
          ) : (
            <ul className="overflow-hidden rounded-panel border border-line bg-surface">
              {events.map((event) => (
                <li
                  key={event.id}
                  className="border-t border-line first:border-t-0"
                >
                  <Link
                    href={event.href}
                    className="flex items-start gap-3.5 p-4 transition-colors hover:bg-surface-2 sm:px-5"
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-subtle"
                    >
                      <event.icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-fg">
                        {event.what}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-subtle">
                        {event.detail} &middot; {ago(event.at, now)}
                      </span>
                    </span>
                    {event.outcome ? (
                      <Badge className="mt-0.5 shrink-0">{event.outcome}</Badge>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* ---- the very first visit ---------------------------------------- */}
      {brandNew ? (
        <Section>
          <div className="rounded-panel border border-line bg-surface p-6 text-center sm:p-8">
            <span
              aria-hidden="true"
              className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary-text"
            >
              <CompassIcon className="size-6" />
            </span>
            <h2 className="mt-5 font-display text-lg font-bold text-fg sm:text-xl">
              Two ways to start
            </h2>
            <p className="mx-auto mt-2.5 max-w-[52ch] text-sm leading-relaxed text-muted">
              List an account you own, or make an offer on one you want. An
              agent from Channel Adda sits in the middle of every deal, so
              neither side has to trust a stranger.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {listButton}
              <Button asChild variant="secondary" size="md">
                <Link href="/browse">Browse accounts</Link>
              </Button>
            </div>
          </div>
        </Section>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces of this page only
 * ------------------------------------------------------------------ */

function MoneyCard({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  note: string;
  tone?: "neutral" | "verified";
}) {
  return (
    <div className="rounded-panel border border-line bg-surface p-4 sm:p-5">
      <p className="font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 font-display text-[1.75rem] leading-none font-black",
          tone === "verified" ? "text-verified" : "text-fg",
        )}
      >
        {value}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-subtle">{note}</p>
    </div>
  );
}

function SidePanel({
  icon: Icon,
  title,
  href,
  hrefLabel,
  children,
}: {
  icon: Icon;
  title: string;
  href: string;
  hrefLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col overflow-hidden rounded-panel border border-line bg-surface">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3.5 sm:px-5">
        <Icon aria-hidden="true" className="size-4 shrink-0 text-subtle" />
        <h2 className="font-display text-base font-bold text-fg">{title}</h2>
        <Link
          href={href}
          className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary-text underline-offset-4 hover:underline"
        >
          {hrefLabel}
          <ArrowRightIcon aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function StatRows({
  rows,
}: {
  rows: {
    label: string;
    value: number;
    note?: string;
    tone?: "neutral" | "verified" | "info";
  }[];
}) {
  return (
    <dl>
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center gap-4 border-t border-line px-4 py-3.5 first:border-t-0 sm:px-5"
        >
          <div className="min-w-0 flex-1">
            <dt className="text-sm font-medium text-fg">{row.label}</dt>
            {row.note ? (
              <dd className="mt-0.5 truncate text-xs text-subtle">
                {row.note}
              </dd>
            ) : null}
          </div>
          <dd
            className={cn(
              "tnum shrink-0 font-display text-xl font-black",
              row.value === 0
                ? "text-subtle"
                : row.tone === "verified"
                  ? "text-verified"
                  : row.tone === "info"
                    ? "text-info"
                    : "text-fg",
            )}
          >
            {row.value.toLocaleString("en-US")}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** An empty list inside a panel: an icon, a sentence, and the next move. */
function InlineEmpty({
  icon: Icon,
  body,
  action,
  boxed,
}: {
  icon: Icon;
  body: string;
  action: ReactNode;
  boxed?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center px-5 py-9 text-center",
        boxed &&
          "rounded-panel border border-dashed border-line-strong bg-surface",
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-11 items-center justify-center rounded-xl bg-surface-2 text-subtle"
      >
        <Icon className="size-5" />
      </span>
      <p className="mt-4 max-w-[44ch] text-sm leading-relaxed text-muted">
        {body}
      </p>
      <div className="mt-5">{action}</div>
    </div>
  );
}
