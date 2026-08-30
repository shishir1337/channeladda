import { ArrowRightIcon, CheckIcon, MailWarningIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  PageHead,
  Panel,
  Row,
  Rows,
  Section,
  Stat,
  StatGrid,
} from "@/components/dashboard/page-parts";
import { Button } from "@/components/ui/button";
import { getBuyerSummary, getSellerSummary } from "@/server/dashboard";
import { getOffersForBuyer, getOffersForSeller } from "@/server/offers";
import { getMyListings } from "@/server/seller-listings";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Overview",
  robots: { index: false, follow: false },
};

function usd(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/** One thing that will not move until this person does something. */
type Task = { href: string; what: string; detail: string; since: Date };

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");

  const [selling, buying, received, made, listings] = await Promise.all([
    getSellerSummary(user.id),
    getBuyerSummary(user.id),
    getOffersForSeller(user.id),
    getOffersForBuyer(user.id),
    getMyListings(user.id),
  ]);

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
        href: "/dashboard/offers",
        what: `Answer ${offer.buyerName.split(/\s+/)[0]}'s offer of ${usd(offer.amount)}`,
        detail: offer.listingHandle,
        since: offer.createdAt,
      })),
    ...made
      .filter((offer) => offer.awaiting === "buyer")
      .map((offer) => ({
        href: "/dashboard/offers",
        what: `Answer the counter of ${usd(offer.amount)}`,
        detail: offer.listingHandle,
        since: offer.createdAt,
      })),
    ...listings
      .filter((listing) => listing.status === "CODE_CHECK")
      .map((listing) => ({
        href: `/dashboard/listings/${listing.id}`,
        what: "Put the ownership code on your profile",
        detail: listing.handle,
        since: listing.updatedAt,
      })),
    ...listings
      .filter((listing) => listing.status === "REJECTED")
      .map((listing) => ({
        href: `/dashboard/listings/${listing.id}`,
        what: "Fix what the review asked for",
        detail: listing.handle,
        since: listing.updatedAt,
      })),
  ].sort((a, b) => a.since.getTime() - b.since.getTime());

  const firstName = user.name.split(/\s+/)[0];

  return (
    <>
      <PageHead
        title={`Hello, ${firstName}`}
        description={
          tasks.length > 0
            ? `${tasks.length} ${tasks.length === 1 ? "thing needs" : "things need"} you.`
            : selling.live > 0
              ? `${selling.live} listing${selling.live === 1 ? "" : "s"} live, ${selling.watching.toLocaleString("en-US")} watching.`
              : "Nothing in flight."
        }
        actions={
          <Button asChild size="md">
            <Link href="/dashboard/listings/new">List an account</Link>
          </Button>
        }
      />

      {!user.emailVerified ? (
        <Section>
          <div className="flex flex-wrap items-center gap-4 rounded-panel border border-primary/35 bg-primary-soft p-4 sm:p-5">
            <MailWarningIcon
              aria-hidden="true"
              className="size-5 shrink-0 text-primary-text"
            />
            <p className="min-w-0 flex-1 text-sm text-fg">
              Confirm your email address to buy or sell. Browsing works without
              it.
            </p>
            <Button asChild size="sm">
              <Link href="/verify-email">Confirm email</Link>
            </Button>
          </div>
        </Section>
      ) : null}

      {tasks.length === 0 ? (
        <Section>
          <p className="flex items-center gap-2.5 rounded-panel border border-line bg-surface px-4 py-3 text-sm text-muted">
            <CheckIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-verified"
            />
            You are all caught up — nothing needs you right now.
          </p>
        </Section>
      ) : (
        <Section title="Waiting on you">
          <Rows>
            {tasks.slice(0, 6).map((task) => (
              <Row key={`${task.href}-${task.what}`}>
                <Link
                  href={task.href}
                  className="flex items-center gap-4 p-4 transition-colors hover:bg-surface-2"
                >
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 animate-pulse-dot rounded-full bg-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">
                      {task.what}
                    </span>
                    <span className="block truncate text-xs text-subtle">
                      {task.detail}
                    </span>
                  </span>
                  <ArrowRightIcon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-subtle"
                  />
                </Link>
              </Row>
            ))}
          </Rows>
        </Section>
      )}

      <Section
        title="Selling"
        actions={
          <Link
            href="/dashboard/listings"
            className="text-sm text-primary-text underline-offset-4 hover:underline"
          >
            All listings
          </Link>
        }
      >
        <StatGrid>
          <Stat
            label="Live"
            value={selling.live}
            note={
              selling.watching > 0
                ? `${selling.watching.toLocaleString("en-US")} watching`
                : "Visible to buyers"
            }
            href="/dashboard/listings"
          />
          <Stat
            label="With us"
            value={selling.inReview}
            note="Being checked"
            tone={selling.inReview > 0 ? "info" : "neutral"}
          />
          <Stat label="Drafts" value={selling.drafts} note="Not sent yet" />
          <Stat
            label="Earned"
            value={usd(selling.earned)}
            note={`${selling.sold} sold`}
            tone={selling.earned > 0 ? "verified" : "neutral"}
          />
        </StatGrid>
      </Section>

      <Section
        title="Buying"
        actions={
          <Link
            href="/dashboard/offers"
            className="text-sm text-primary-text underline-offset-4 hover:underline"
          >
            All offers
          </Link>
        }
      >
        <StatGrid>
          <Stat
            label="Offers out"
            value={buying.openOffers}
            note="Still open"
            href="/dashboard/offers"
          />
          <Stat
            label="Accepted"
            value={buying.accepted}
            note="Held for you"
            tone={buying.accepted > 0 ? "verified" : "neutral"}
          />
          <Stat label="Bought" value={buying.bought} note="Completed" />
          <Stat label="Spent" value={usd(buying.spent)} note="Including fees" />
        </StatGrid>
      </Section>

      {selling.live === 0 && buying.openOffers === 0 && tasks.length === 0 ? (
        <Section>
          <Panel className="text-center">
            <h2 className="font-display text-lg font-bold text-fg">
              Nothing in flight
            </h2>
            <p className="mx-auto mt-2 max-w-[48ch] text-sm leading-relaxed text-muted">
              List an account you own, or make an offer on one you want. Offers
              cost nothing and the seller has two days to answer.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button asChild size="md">
                <Link href="/dashboard/listings/new">List an account</Link>
              </Button>
              <Button asChild variant="secondary" size="md">
                <Link href="/browse">Browse accounts</Link>
              </Button>
            </div>
          </Panel>
        </Section>
      ) : null}
    </>
  );
}
