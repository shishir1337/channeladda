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
  List,
  ListItem,
  PageHeader,
  Section,
  Sep,
  SplitBar,
  TurnFlag,
} from "@/components/app/kit";
import {
  ListingStatusBadge,
  statusMeta,
} from "@/components/dashboard/listing-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { platforms } from "@/data/platforms";
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
        <PlusIcon aria-hidden="true" />
        List an account
      </Link>
    </Button>
  );

  const watching = onSale.reduce((n, l) => n + l.watching, 0);

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
                  Three steps and about ten minutes. Nothing goes in front of
                  buyers until you have proved the account is yours and a
                  moderator has checked it — and you can stop halfway and come
                  back to a saved draft.
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
                  <InfoTip label={`About step ${i + 1}`}>{step.body}</InfoTip>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      ) : (
        // The stages as one bar rather than four boxes of numbers: how the
        // listings split is the thing to see, and the sections below hold
        // the detail.
        <Card padded>
          <div className="flex items-end justify-between gap-6">
            <div className="min-w-0">
              <p className="text-[0.8125rem] leading-5 font-medium text-muted">
                All listings
              </p>
              <p className="mt-1 text-[1.625rem] leading-8 font-semibold tracking-[-0.02em] text-fg tabular-nums">
                {listings.length.toLocaleString("en-US")}
              </p>
            </div>
            <div className="min-w-0 text-right">
              <p className="text-[0.8125rem] leading-5 font-medium text-muted">
                Watching
              </p>
              <p className="mt-1 text-[1.625rem] leading-8 font-semibold tracking-[-0.02em] text-fg tabular-nums">
                {watching.toLocaleString("en-US")}
              </p>
            </div>
          </div>
          <SplitBar
            className="mt-4"
            label="Your listings by stage"
            parts={[
              {
                label:
                  needsYou.length > 0 ? (
                    <Link
                      href="/dashboard/listings#waiting"
                      className="relative rounded-sm font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:decoration-fg pointer-coarse:after:absolute pointer-coarse:after:-inset-3 pointer-coarse:after:content-['']"
                    >
                      Waiting on you
                    </Link>
                  ) : (
                    "Waiting on you"
                  ),
                value: needsYou.length,
                tone: "primary",
              },
              { label: "On sale", value: onSale.length, tone: "verified" },
              { label: "Not live yet", value: inProgress.length, tone: "info" },
              { label: "Sold", value: archive.length, tone: "muted" },
            ]}
          />
        </Card>
      )}

      {needsYou.length > 0 ? (
        <Section
          id="waiting"
          title="Waiting on you"
          info="These will not move until you act."
          count={needsYou.length}
          tone="primary"
          className="scroll-mt-24"
        >
          <List>
            {needsYou.map((listing) => (
              <ListingRow key={listing.id} listing={listing} needsYou />
            ))}
          </List>
        </Section>
      ) : null}

      {onSale.length > 0 ? (
        <Section
          title="On sale"
          info="Live listings are visible to buyers. A paused one keeps its place and can go back up any time."
          count={onSale.length}
        >
          <List>
            {onSale.map((listing) => (
              <ListingRow key={listing.id} listing={listing} />
            ))}
          </List>
        </Section>
      ) : null}

      {inProgress.length > 0 ? (
        <Section
          title="Not live yet"
          info="Drafts are private. Anything in review is with a moderator."
          count={inProgress.length}
        >
          <List>
            {inProgress.map((listing) => (
              <ListingRow key={listing.id} listing={listing} />
            ))}
          </List>
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
          count={archive.length}
        >
          <List>
            {archive.slice(0, ARCHIVE_SHOWN).map((listing) => (
              <ListingRow key={listing.id} listing={listing} />
            ))}
          </List>
        </Section>
      ) : null}
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
  const move = NEXT_MOVE[listing.status];
  // The one status whose meaning no badge or section on this page says.
  const note =
    move ??
    (listing.status === "RESERVED" ? statusMeta(listing.status).note : null);
  const platform = platforms.find((p) => p.id === listing.platform);

  return (
    <ListItem href={`/dashboard/listings/${listing.id}`}>
      <div className="flex items-start gap-3 sm:gap-4">
        <span className="relative shrink-0">
          {listing.coverUrl ? (
            <>
              {/* biome-ignore lint/performance/noImgElement: the seller's own
                  upload at 96px. Dimensions are set, so nothing shifts. */}
              <img
                src={listing.coverUrl}
                alt=""
                width={96}
                height={56}
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
              <p className="flex min-w-0 items-center gap-1.5 text-sm leading-5 font-medium text-fg">
                <span className="truncate">
                  {listing.title || listing.handle}
                </span>
                {listing.ownershipVerifiedAt ? <VerifiedMark /> : null}
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
                  audience
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

        <ChevronRightIcon
          aria-hidden="true"
          className="mt-0.5 hidden size-4 shrink-0 text-subtle transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-muted sm:block"
        />
      </div>
    </ListItem>
  );
}
