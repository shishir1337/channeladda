import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ListingStatusBadge } from "@/components/dashboard/listing-status";
import {
  Empty,
  PageHead,
  Row,
  Rows,
  Section,
} from "@/components/dashboard/page-parts";
import { Button } from "@/components/ui/button";
import type { ListingStatus } from "@/generated/prisma/enums";
import { getMyListings, type SellerListing } from "@/server/seller-listings";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Your listings",
  robots: { index: false, follow: false },
};

function usd(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/**
 * Listings are grouped by what stage they are at, not listed flat.
 *
 * A seller with a hundred completed sales was scrolling past all of them to
 * find the five that are actually live. Sold listings are an archive: worth
 * keeping, not worth leading with.
 */
const NEEDS_YOU: readonly ListingStatus[] = ["CODE_CHECK", "REJECTED"];
const ON_SALE: readonly ListingStatus[] = ["LIVE", "RESERVED", "PAUSED"];
const IN_PROGRESS: readonly ListingStatus[] = ["DRAFT", "ADMIN_REVIEW"];

/** How much of the archive to show before it becomes noise. */
const ARCHIVE_SHOWN = 8;

export default async function MyListingsPage() {
  const user = await requireUser("/dashboard/listings");
  const listings = await getMyListings(user.id);

  const needsYou = listings.filter((l) => NEEDS_YOU.includes(l.status));
  const onSale = listings.filter((l) => ON_SALE.includes(l.status));
  const inProgress = listings.filter((l) => IN_PROGRESS.includes(l.status));
  const archive = listings.filter(
    (l) =>
      !NEEDS_YOU.includes(l.status) &&
      !ON_SALE.includes(l.status) &&
      !IN_PROGRESS.includes(l.status),
  );

  const newButton = (
    <Button asChild size="md">
      <Link href="/dashboard/listings/new">
        <PlusIcon aria-hidden="true" className="size-4" />
        New listing
      </Link>
    </Button>
  );

  return (
    <>
      <PageHead
        title="Your listings"
        description={
          listings.length === 0
            ? "Nothing here yet."
            : `${onSale.length} on sale, ${archive.length} sold.`
        }
        actions={newButton}
      />

      {listings.length === 0 ? (
        <Section>
          <Empty
            title="List your first account"
            body="You will need screenshots from inside the account and a few minutes. Nothing goes in front of buyers until you have proved the account is yours and a moderator has checked it."
            action={newButton}
          />
        </Section>
      ) : null}

      {needsYou.length > 0 ? (
        <Section
          title="Waiting on you"
          description="These will not move until you act."
        >
          <Rows>
            {needsYou.map((listing) => (
              <ListingRow key={listing.id} listing={listing} needsYou />
            ))}
          </Rows>
        </Section>
      ) : null}

      {onSale.length > 0 ? (
        <Section title="On sale">
          <Rows>
            {onSale.map((listing) => (
              <ListingRow key={listing.id} listing={listing} />
            ))}
          </Rows>
        </Section>
      ) : null}

      {inProgress.length > 0 ? (
        <Section title="Not live yet">
          <Rows>
            {inProgress.map((listing) => (
              <ListingRow key={listing.id} listing={listing} />
            ))}
          </Rows>
        </Section>
      ) : null}

      {archive.length > 0 ? (
        <Section
          title="Sold"
          description={
            archive.length > ARCHIVE_SHOWN
              ? `The ${ARCHIVE_SHOWN} most recent of ${archive.length}.`
              : undefined
          }
        >
          <Rows>
            {archive.slice(0, ARCHIVE_SHOWN).map((listing) => (
              <ListingRow key={listing.id} listing={listing} />
            ))}
          </Rows>
        </Section>
      ) : null}
    </>
  );
}

function ListingRow({
  listing,
  needsYou,
}: {
  listing: SellerListing;
  needsYou?: boolean;
}) {
  return (
    <Row>
      <Link
        href={`/dashboard/listings/${listing.id}`}
        className="flex items-center gap-4 p-4 transition-colors hover:bg-surface-2"
      >
        {/* biome-ignore lint/performance/noImgElement: the seller's own upload
            at 56px. Dimensions are set, so there is no layout shift. */}
        <img
          src={listing.coverUrl}
          alt=""
          width={96}
          height={56}
          className="hidden h-14 w-24 shrink-0 rounded-lg border border-line object-cover sm:block"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ListingStatusBadge status={listing.status} size="sm" />
            <span className="text-xs text-subtle capitalize">
              {listing.platform}
            </span>
            {needsYou ? (
              <span className="inline-flex items-center gap-1.5 font-mono text-[0.6875rem] font-semibold tracking-wide text-primary-text uppercase">
                <span
                  aria-hidden="true"
                  className="size-1.5 animate-pulse-dot rounded-full bg-primary"
                />
                Your move
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 truncate font-medium text-fg">
            {listing.title || listing.handle}
          </p>
          <p className="truncate text-sm text-subtle">
            {listing.handle} · {listing.audience.toLocaleString("en-US")}{" "}
            audience
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display font-bold text-fg tabular-nums">
            {usd(listing.price)}
          </p>
          {listing.status === "LIVE" ? (
            <p className="text-xs text-subtle tabular-nums">
              {listing.watching} watching
            </p>
          ) : null}
        </div>
      </Link>
    </Row>
  );
}
