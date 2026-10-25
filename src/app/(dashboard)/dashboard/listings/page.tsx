import {
  ArrowRightIcon,
  BadgeCheckIcon,
  CameraIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  ImageIcon,
  LinkIcon,
  PlusIcon,
  ShieldAlertIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { InfoTip } from "@/components/app/info-tip";
import {
  Card,
  EmptyState,
  FilterBar,
  FilterLink,
  List,
  ListItem,
  PageHeader,
  Sep,
  TurnFlag,
} from "@/components/app/kit";
import { ListingRowMenu } from "@/components/dashboard/listing-row-menu";
import {
  ListingStatusBadge,
  statusMeta,
} from "@/components/dashboard/listing-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { platforms } from "@/data/platforms";
import type { ListingStatus } from "@/generated/prisma/enums";
import { artworkProps } from "@/lib/artwork";
import { LIVE_EDITABLE, REMOVABLE, removedBySeller } from "@/lib/listing-lock";
import { pickTab } from "@/lib/tabs";
import { cn } from "@/lib/utils";
import {
  getMyListings,
  lockedListingIds,
  type SellerListing,
} from "@/server/seller-listings";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Your listings",
  robots: { index: false, follow: false },
};

function usd(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "26 Oct", as the rest of the dashboard writes a day. */
function day(date: Date) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Listings are grouped by what stage they are at, not listed flat.
 *
 * A seller with a hundred completed sales was scrolling past all of them to
 * find the five that are actually live. Sold listings are an archive: worth
 * keeping, not worth leading with.
 */
const NEEDS_YOU: readonly ListingStatus[] = ["CODE_CHECK", "REJECTED"];
// Paused is not on sale: buyers cannot see it. It has a tab of its own.
const ON_SALE: readonly ListingStatus[] = ["LIVE", "RESERVED"];
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

/**
 * Removed listings have a tab of their own, last, and only once there is one:
 * off the marketplace for good, they are a record and not something to work
 * on, and they were mixed in with the sales before. Paused ones likewise,
 * beside On sale: they were counted as on sale while no buyer could see them.
 */
type ListingTab = "yours" | "sale" | "paused" | "draft" | "sold" | "removed";
const LISTING_TABS: readonly ListingTab[] = [
  "yours",
  "sale",
  "paused",
  "draft",
  "sold",
  "removed",
];

/** Tabs shown only once something is in them. */
const ONLY_WHEN_USED: readonly ListingTab[] = ["paused", "removed"];

const TAB_LABEL: Record<ListingTab, string> = {
  yours: "Your turn",
  sale: "On sale",
  paused: "Paused",
  draft: "Not live yet",
  sold: "Sold",
  removed: "Removed",
};

const TAB_EMPTY: Record<ListingTab, string> = {
  yours: "Nothing needs you right now.",
  sale: "Nothing is on sale right now.",
  paused: "Nothing is paused.",
  draft: "No drafts or listings in review.",
  sold: "Nothing sold yet.",
  removed: "Nothing removed.",
};

/**
 * Your listings in tabs by stage, as Deals and Offers are: the page opens on
 * whatever needs you, and each listing sits in one place.
 */
export default async function MyListingsPage({
  searchParams,
}: PageProps<"/dashboard/listings">) {
  const user = await requireUser("/dashboard/listings");
  const [listings, locked, params] = await Promise.all([
    getMyListings(user.id),
    lockedListingIds(user.id),
    searchParams,
  ]);

  const needsYou = listings.filter((l) => NEEDS_YOU.includes(l.status));
  const onSale = listings.filter((l) => ON_SALE.includes(l.status));
  const paused = listings.filter((l) => l.status === "PAUSED");
  const inProgress = listings.filter((l) => IN_PROGRESS.includes(l.status));
  const archive = listings.filter((l) => l.status === "SOLD");
  const removed = listings.filter((l) => l.status === "REMOVED");

  const groups: Record<ListingTab, typeof listings> = {
    yours: needsYou,
    sale: onSale,
    paused,
    draft: inProgress,
    sold: archive.slice(0, ARCHIVE_SHOWN),
    removed: removed.slice(0, ARCHIVE_SHOWN),
  };
  const counts: Record<ListingTab, number> = {
    yours: needsYou.length,
    sale: onSale.length,
    paused: paused.length,
    draft: inProgress.length,
    sold: archive.length,
    removed: removed.length,
  };
  const tab = pickTab(
    typeof params.tab === "string" ? params.tab : undefined,
    LISTING_TABS,
    counts,
  );

  const newButton = (
    <Button asChild size="md">
      <Link href="/dashboard/listings/new">
        <PlusIcon aria-hidden="true" />
        List an account
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Your listings"
        description={
          listings.length === 0
            ? "A listing is free, and it stays private until you send it."
            : needsYou.length > 0
              ? `${needsYou.length} ${needsYou.length === 1 ? "listing needs" : "listings need"} something from you.`
              : // How many are on sale and sold is the bar just below.
                undefined
        }
        actions={listings.length === 0 ? undefined : newButton}
      />

      {listings.length === 0 ? (
        <Card>
          <EmptyState
            bare
            icon={PlusIcon}
            title={
              <>
                List your first account{" "}
                <InfoTip label="About listing an account">
                  Three steps and about ten minutes. Buyers see nothing until
                  you have proved the account is yours, and you can stop halfway
                  and come back to a saved draft.
                </InfoTip>
              </>
            }
            body="Three steps and about ten minutes."
            action={
              <>
                {newButton}
                <Button asChild variant="ghost" size="md">
                  <Link href="/sell">
                    How selling works, in full
                    <ArrowRightIcon aria-hidden="true" />
                  </Link>
                </Button>
              </>
            }
          />
          <ol className="grid divide-y divide-line border-t border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {FIRST_STEPS.map((step, i) => (
              <li key={step.title} className="p-4 sm:p-5">
                <div className="flex items-center gap-2 text-xs font-medium text-subtle">
                  <step.icon aria-hidden="true" className="size-3.5" />
                  <span className="tabular-nums">Step {i + 1}</span>
                </div>
                <div className="mt-2 flex items-start gap-1.5">
                  <h2 className="text-sm leading-5 font-semibold text-fg">
                    {step.title}
                  </h2>
                  <InfoTip label={`About step ${i + 1}: ${step.title}`}>
                    {step.body}
                  </InfoTip>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      ) : (
        <>
          {/* Wrapped, not scrolled: on a phone the last tabs sat off the
              edge with nothing to say they were there. */}
          <FilterBar
            label="Your listings by stage"
            className="mx-0 mb-5 px-0 [&>div]:min-w-0 [&>div]:flex-wrap [&>div]:gap-x-4"
          >
            {LISTING_TABS.filter(
              (name) =>
                !ONLY_WHEN_USED.includes(name) ||
                counts[name] > 0 ||
                tab === name,
            ).map((name) => (
              <FilterLink
                key={name}
                href={`/dashboard/listings?tab=${name}`}
                active={tab === name}
                count={counts[name]}
                tone={name === "yours" ? "primary" : "neutral"}
              >
                {TAB_LABEL[name]}
              </FilterLink>
            ))}
          </FilterBar>

          {groups[tab].length > 0 ? (
            <>
              <List>
                {groups[tab].map((listing) => (
                  <ListingRow
                    key={listing.id}
                    listing={listing}
                    needsYou={tab === "yours"}
                    locked={locked.has(listing.id)}
                  />
                ))}
              </List>
              {(tab === "sold" || tab === "removed") &&
              counts[tab] > ARCHIVE_SHOWN ? (
                <p className="mt-3 text-xs text-subtle">
                  The {ARCHIVE_SHOWN} most recent of {counts[tab]}.
                </p>
              ) : null}
            </>
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

/**
 * The ownership check, as a seller needs to see it on a list.
 *
 * Verified is the normal state of a listing on sale, so on a row it is a
 * tick beside the name — the badge a buyer sees — rather than a chip on every
 * line. Only the exception gets words.
 */
function VerifiedMark() {
  return (
    <span title="Ownership verified" className="inline-flex shrink-0">
      <BadgeCheckIcon aria-hidden="true" className="size-4 text-verified" />
      <span className="sr-only">Ownership verified</span>
    </span>
  );
}

function OwnershipChip({ listing }: { listing: SellerListing }) {
  if (listing.ownershipVerifiedAt) return null;
  // A draft has not been asked for a code yet, so saying it is unverified
  // would be telling someone off for something they cannot have done. And at
  // CODE_CHECK the status badge beside this already reads "Waiting on your
  // code", so a second chip saying the same thing is noise.
  if (listing.status === "DRAFT" || listing.status === "CODE_CHECK")
    return null;
  return (
    <Badge variant="warning">
      <ShieldAlertIcon aria-hidden="true" />
      Ownership not verified
    </Badge>
  );
}

/**
 * Where "Edit" goes from a row, or null when there is nowhere yet: a draft
 * is edited on its own page, a listing on sale on its edit page, and one in
 * review has to be pulled back first.
 */
function editHrefFor(listing: SellerListing, locked: boolean) {
  if (listing.status === "DRAFT" || listing.status === "REJECTED") {
    return `/dashboard/listings/${listing.id}#edit`;
  }
  if (LIVE_EDITABLE.includes(listing.status) && !locked) {
    return `/dashboard/listings/${listing.id}/edit`;
  }
  return null;
}

/** What a removed listing's row says about who took it down. */
function removedNote(listing: SellerListing) {
  return removedBySeller(listing)
    ? "You removed this listing."
    : "Taken down by a moderator. Open it to see why.";
}

function ListingRow({
  listing,
  needsYou,
  locked,
}: {
  listing: SellerListing;
  needsYou?: boolean;
  /** A running deal holds it, so it cannot be edited or removed. */
  locked: boolean;
}) {
  const move = NEXT_MOVE[listing.status];
  // The one status whose meaning no badge or section on this page says.
  const note =
    move ??
    (listing.status === "RESERVED" || locked
      ? statusMeta("RESERVED").note
      : listing.status === "REMOVED"
        ? removedNote(listing)
        : null);
  const platform = platforms.find((p) => p.id === listing.platform);
  const editHref = editHrefFor(listing, locked);
  const canRemove = REMOVABLE.includes(listing.status) && !locked;
  // A paused listing a deal still holds stays paused until the deal ends.
  const pause =
    listing.status === "LIVE"
      ? ("pause" as const)
      : listing.status === "PAUSED" && !locked
        ? ("resume" as const)
        : null;
  const href = `/dashboard/listings/${listing.id}`;

  const body = (
    <div className="flex items-start gap-3 sm:gap-4">
      <span className="relative shrink-0">
        {listing.coverUrl ? (
          <>
            {/* biome-ignore lint/performance/noImgElement: the seller's own
                  upload at 80px, resized by `artworkProps`. Dimensions are
                  set, so nothing shifts. */}
            <img
              {...artworkProps({
                src: listing.coverUrl,
                width: 80,
                height: 48,
              })}
              alt=""
              className="h-10 w-16 rounded-md border border-line bg-surface-2 object-cover sm:h-12 sm:w-20"
            />
          </>
        ) : (
          // A draft is allowed to have no cover yet, and `src=""` makes the
          // browser re-request the page as an image.
          <span className="flex h-10 w-16 items-center justify-center rounded-md border border-dashed border-line-strong bg-surface-2 text-subtle sm:h-12 sm:w-20">
            <ImageIcon aria-hidden="true" className="size-4" />
          </span>
        )}
        {platform ? (
          <span
            aria-hidden="true"
            className="absolute -right-1.5 -bottom-1.5 flex size-5 items-center justify-center rounded-md border border-line bg-surface shadow-xs"
            style={{ color: platform.tint }}
          >
            <platform.icon className="size-3" />
          </span>
        ) : null}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/* Two lines before it is cut: one cut "Crypto Signals …" on a
                phone with room to spare below. */}
            <p className="flex min-w-0 items-start gap-1.5 text-sm leading-5 font-medium text-fg">
              <span className="line-clamp-2 break-words">
                {listing.title || listing.handle}
              </span>
              {listing.ownershipVerifiedAt ? (
                <span className="mt-0.5 inline-flex">
                  <VerifiedMark />
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[0.8125rem] leading-5 text-muted">
              <span className="capitalize">
                {platform?.name ?? listing.platform}
              </span>
              <Sep />
              <span className="min-w-0 max-w-full truncate">
                {listing.handle}
              </span>
              <Sep />
              <span className="whitespace-nowrap">
                <span className="tabular-nums">
                  {listing.audience.toLocaleString("en-US")}
                </span>{" "}
                {(platform?.metricLabel ?? "Audience").toLowerCase()}
              </span>
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm leading-5 font-medium text-fg tabular-nums">
              {usd(listing.price)}
            </p>
            {listing.status === "LIVE" ? (
              <p className="mt-0.5 text-xs leading-5 text-subtle tabular-nums">
                {listing.watching} watching
              </p>
            ) : (
              <p className="mt-0.5 text-xs leading-5 whitespace-nowrap text-subtle">
                Updated {day(listing.updatedAt)}
              </p>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <ListingStatusBadge status={listing.status} size="sm" />
          <OwnershipChip listing={listing} />
          {needsYou ? <TurnFlag mine /> : null}
          {/* What to do next, in the seller's language — "CODE_CHECK"
                tells nobody anything. Only where there is a move: what a live,
                paused or in-review listing means is said once, beside its
                section's heading, not again on every row. The line is louder
                when the move is the seller's. */}
          {note ? (
            <span
              className={cn(
                "basis-full text-[0.8125rem] leading-5 sm:basis-auto",
                needsYou ? "text-fg" : "text-muted",
              )}
            >
              {note}
            </span>
          ) : null}
        </div>

        {listing.status === "REJECTED" && listing.rejectionReason ? (
          <span className="mt-2.5 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft/60 px-3 py-2">
            <CircleAlertIcon
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-danger"
            />
            <span className="min-w-0 text-[0.8125rem] leading-relaxed">
              <span className="font-medium text-fg">Why it came back:</span>{" "}
              <span className="text-muted">{listing.rejectionReason}</span>
            </span>
          </span>
        ) : null}
      </div>

      {editHref || canRemove || pause ? null : (
        <ChevronRightIcon
          aria-hidden="true"
          className="mt-0.5 hidden size-4 shrink-0 text-subtle transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-muted sm:block"
        />
      )}
    </div>
  );

  if (!editHref && !canRemove && !pause) {
    return <ListItem href={href}>{body}</ListItem>;
  }

  // The row is still one link, with the menu beside it rather than inside
  // it: a button inside a link is two controls in one, and a tap on the
  // menu would open the listing too.
  return (
    <ListItem
      padded={false}
      className="flex items-start transition-colors duration-150 hover:bg-surface-2/60"
    >
      <Link
        href={href}
        className="group block min-w-0 flex-1 py-3 pl-3.5 focus-visible:-outline-offset-2 sm:pl-5"
      >
        {body}
      </Link>
      <div className="shrink-0 py-1.5 pr-1 pl-1 sm:py-2 sm:pr-3 sm:pl-2">
        <ListingRowMenu
          listingId={listing.id}
          name={listing.title || listing.handle}
          editHref={editHref}
          canRemove={canRemove}
          pause={pause}
        />
      </div>
    </ListItem>
  );
}
