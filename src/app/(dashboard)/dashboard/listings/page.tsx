import {
  ArrowRightIcon,
  BadgeCheckIcon,
  CameraIcon,
  CircleAlertIcon,
  ImageIcon,
  LinkIcon,
  PlusIcon,
  ShieldAlertIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ListingStatusBadge,
  statusMeta,
} from "@/components/dashboard/listing-status";
import {
  PageHead,
  Row,
  Rows,
  Section,
  Stat,
  StatGrid,
  TurnFlag,
} from "@/components/dashboard/page-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ListingStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
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

function day(date: Date) {
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
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

/**
 * What the seller is supposed to do next, per status.
 *
 * `statusMeta` says what a status *means*; this says whose hands it is in and
 * what the move is. A seller looking at CODE_CHECK needs the second one.
 */
const NEXT_MOVE: Partial<Record<ListingStatus, string>> = {
  DRAFT: "Finish it and send it for review.",
  CODE_CHECK:
    "Put the ownership code in your account description, then tell us it is there.",
  REJECTED: "Read the note, fix what it asks for, and send it back.",
};

/** What listing involves, for someone who has never done it. */
const FIRST_STEPS = [
  {
    icon: LinkIcon,
    title: "Paste your channel link",
    body: "We read the name, the picture and the subscriber count from it, so there is far less to type.",
  },
  {
    icon: CameraIcon,
    title: "Add screenshots from inside the account",
    body: "Analytics or revenue. They prove your figures to a moderator and are never published in full.",
  },
  {
    icon: BadgeCheckIcon,
    title: "Prove it is yours",
    body: "We give you a one-time code for your description and read it back. Only the owner can put it there.",
  },
];

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
            ? "Nothing here yet. A listing is free, and it stays private until you send it."
            : needsYou.length > 0
              ? `${needsYou.length} ${needsYou.length === 1 ? "listing needs" : "listings need"} something from you.`
              : `${onSale.length} on sale, ${archive.length} sold.`
        }
        actions={newButton}
      />

      {listings.length === 0 ? (
        <Section>
          <div className="rounded-panel border border-dashed border-line-strong bg-surface px-5 py-8 sm:px-8 sm:py-12">
            <div className="mx-auto max-w-2xl text-center">
              <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary-text">
                <PlusIcon aria-hidden="true" className="size-6" />
              </span>
              <h2 className="mt-5 font-display text-xl font-bold text-fg sm:text-2xl">
                List your first account
              </h2>
              <p className="mx-auto mt-2.5 max-w-[52ch] text-sm leading-relaxed text-muted">
                Selling here takes three steps and about ten minutes. Nothing
                goes in front of buyers until you have proved the account is
                yours and a moderator has checked it — and you can stop halfway
                and come back to a saved draft.
              </p>
            </div>

            <ol className="mx-auto mt-8 grid max-w-3xl gap-3 sm:grid-cols-3">
              {FIRST_STEPS.map((step, i) => (
                <li
                  key={step.title}
                  className="rounded-card border border-line bg-surface-2 p-4 text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface text-primary-text">
                      <step.icon aria-hidden="true" className="size-4" />
                    </span>
                    <span className="tnum font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase">
                      Step {i + 1}
                    </span>
                  </div>
                  <h3 className="mt-3 font-display text-sm font-bold text-fg">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>

            <div className="mt-8 flex flex-col items-center gap-3">
              {newButton}
              <Link
                href="/sell"
                className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
              >
                How selling works, in full
                <ArrowRightIcon aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>
        </Section>
      ) : (
        <Section>
          <StatGrid>
            <Stat
              label="Waiting on you"
              value={needsYou.length}
              note={
                needsYou.length > 0
                  ? "Will not move until you act"
                  : "Nothing to do"
              }
              tone={needsYou.length > 0 ? "primary" : "neutral"}
              href={
                needsYou.length > 0 ? "/dashboard/listings#waiting" : undefined
              }
            />
            <Stat
              label="On sale"
              value={onSale.length}
              note={`${onSale
                .reduce((n, l) => n + l.watching, 0)
                .toLocaleString("en-US")} watching`}
              tone={onSale.length > 0 ? "verified" : "neutral"}
            />
            <Stat
              label="Not live yet"
              value={inProgress.length}
              note="Drafts and reviews"
            />
            <Stat label="Sold" value={archive.length} note="Changed hands" />
          </StatGrid>
        </Section>
      )}

      {needsYou.length > 0 ? (
        <div id="waiting" className="mt-8 scroll-mt-24">
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
        </div>
      ) : null}

      {onSale.length > 0 ? (
        <Section
          title="On sale"
          description="Live listings are visible to buyers. A paused one keeps its place and can go back up any time."
        >
          <Rows>
            {onSale.map((listing) => (
              <ListingRow key={listing.id} listing={listing} />
            ))}
          </Rows>
        </Section>
      ) : null}

      {inProgress.length > 0 ? (
        <Section
          title="Not live yet"
          description="Drafts are private. Anything in review is with a moderator."
        >
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

/** The ownership check, as a seller needs to see it on a list. */
function OwnershipChip({ listing }: { listing: SellerListing }) {
  if (listing.ownershipVerifiedAt) {
    return (
      <Badge variant="verified">
        <BadgeCheckIcon aria-hidden="true" />
        Ownership verified
      </Badge>
    );
  }
  // A draft has not been asked for a code yet, so saying it is unverified
  // would be telling someone off for something they cannot have done. And at
  // CODE_CHECK the status badge beside this already reads "Waiting on your
  // code", so a second chip saying the same thing is noise.
  if (listing.status === "DRAFT" || listing.status === "CODE_CHECK")
    return null;
  return (
    <Badge variant="neutral">
      <ShieldAlertIcon aria-hidden="true" />
      Ownership not verified
    </Badge>
  );
}

function ListingRow({
  listing,
  needsYou,
}: {
  listing: SellerListing;
  needsYou?: boolean;
}) {
  const meta = statusMeta(listing.status);
  const move = NEXT_MOVE[listing.status];

  return (
    <Row>
      <Link
        href={`/dashboard/listings/${listing.id}`}
        className="block p-4 transition-colors hover:bg-surface-2"
      >
        <div className="flex items-start gap-3 sm:gap-4">
          {listing.coverUrl ? (
            <>
              {/* biome-ignore lint/performance/noImgElement: the seller's own
                  upload at 96px. Dimensions are set, so nothing shifts. */}
              <img
                src={listing.coverUrl}
                alt=""
                width={96}
                height={56}
                className="h-12 w-16 shrink-0 rounded-lg border border-line bg-surface-2 object-cover sm:h-14 sm:w-24"
              />
            </>
          ) : (
            // A draft is allowed to have no cover yet, and `src=""` makes the
            // browser re-request the page as an image.
            <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface-2 text-subtle sm:h-14 sm:w-24">
              <ImageIcon aria-hidden="true" className="size-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <ListingStatusBadge status={listing.status} size="sm" />
              <OwnershipChip listing={listing} />
              {needsYou ? <TurnFlag mine /> : null}
            </div>
            <p className="mt-2 truncate font-medium text-fg">
              {listing.title || listing.handle}
            </p>
            <p className="truncate text-sm text-subtle">
              <span className="capitalize">{listing.platform}</span> ·{" "}
              {listing.handle} ·{" "}
              <span className="tnum">
                {listing.audience.toLocaleString("en-US")}
              </span>{" "}
              audience
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="tnum font-display font-bold text-fg">
              {usd(listing.price)}
            </p>
            {listing.status === "LIVE" ? (
              <p className="tnum text-xs text-subtle">
                {listing.watching} watching
              </p>
            ) : (
              <p className="text-xs text-subtle">
                Updated {day(listing.updatedAt)}
              </p>
            )}
          </div>
        </div>

        {/* What this status means, in the seller's language, on every row —
            "ADMIN_REVIEW" and "CODE_CHECK" tell nobody anything. The line is
            louder when the move is the seller's. */}
        <p
          className={cn(
            "mt-2.5 text-sm leading-relaxed",
            needsYou ? "text-fg" : "text-muted",
          )}
        >
          {move ?? meta.note}
        </p>

        {listing.status === "REJECTED" && listing.rejectionReason ? (
          <span className="mt-2.5 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft p-3">
            <CircleAlertIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-danger"
            />
            <span className="min-w-0">
              <span className="block text-xs font-semibold tracking-wide text-subtle uppercase">
                Why it came back
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-fg">
                {listing.rejectionReason}
              </span>
            </span>
          </span>
        ) : null}
      </Link>
    </Row>
  );
}
