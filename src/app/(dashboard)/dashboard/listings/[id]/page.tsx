import {
  BadgeCheckIcon,
  ExternalLinkIcon,
  ImageIcon,
  LockIcon,
  PencilIcon,
  ShieldAlertIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AllClear,
  Callout,
  Card,
  CardBody,
  Count,
  Fact,
  Facts,
  PageHeader,
  Section,
  Sep,
  TurnFlag,
} from "@/components/app/kit";
import { ListingControls } from "@/components/dashboard/listing-actions";
import {
  ListingForm,
  type PlatformChoice,
} from "@/components/dashboard/listing-form";
import {
  ListingStatusBadge,
  statusMeta,
} from "@/components/dashboard/listing-status";
import { OwnershipPanel } from "@/components/dashboard/ownership-check";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { platforms } from "@/data/platforms";
import type { ListingStatus } from "@/generated/prisma/enums";
import { LOCK_TEXT, removedBySeller } from "@/lib/listing-lock";
import { cn } from "@/lib/utils";
import {
  EDITABLE,
  getListingLocks,
  getMyListing,
} from "@/server/seller-listings";
import { requireUser } from "@/server/session";
import { getFeeSettings } from "@/server/settings";

export const metadata: Metadata = {
  title: "Listing",
  robots: { index: false, follow: false },
};

const choices: PlatformChoice[] = platforms.map((p) => ({
  id: p.id,
  name: p.name,
  metricLabel: p.metricLabel,
  transferNote: p.transferNote,
  tint: p.tint,
}));

type Listing = NonNullable<Awaited<ReturnType<typeof getMyListing>>>;

function usd(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fullDay(date: Date) {
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * The road a listing travels, so a status is a position rather than a word.
 *
 * Sellers do not know what "CODE_CHECK" is, but everybody understands being
 * two stops from the end.
 */
const PIPELINE = ["Draft", "Ownership", "Review", "On sale"] as const;

const AT: Record<ListingStatus, number> = {
  DRAFT: 0,
  CODE_CHECK: 1,
  ADMIN_REVIEW: 2,
  REJECTED: 2,
  LIVE: 3,
  RESERVED: 3,
  PAUSED: 3,
  SOLD: 3,
  REMOVED: 3,
};

/** Statuses where the stop the listing is parked at is a problem. */
const STUCK: readonly ListingStatus[] = ["REJECTED", "REMOVED"];

/**
 * The stop a listing is parked at takes its status badge's colour, so the
 * bar and the badge never disagree: gold when the move is the seller's, blue
 * while it is with us, green once it is on sale.
 */
const CURRENT_BAR: Record<string, string> = {
  neutral: "bg-fg/70",
  primary: "bg-primary",
  info: "bg-info",
  verified: "bg-verified",
  danger: "bg-danger",
};

/** What "Manage this listing" says about each status's buttons. */
const MANAGE_INFO: Partial<Record<ListingStatus, string>> = {
  LIVE: "Pausing hides it from buyers without losing anything. Removing takes it off the marketplace for good.",
  PAUSED:
    "Putting it back up shows it to buyers again. Removing takes it off the marketplace for good.",
  ADMIN_REVIEW: "Pulling it back turns it into a draft you can edit again.",
};

export default async function SellerListingPage({
  params,
  searchParams,
}: PageProps<"/dashboard/listings/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/listings/${id}`);

  // Scoped to the owner, so somebody else's id is indistinguishable from one
  // that does not exist.
  const [listing, locks, fees, query] = await Promise.all([
    getMyListing(user.id, id),
    getListingLocks(user.id, id),
    getFeeSettings(),
    searchParams,
  ]);
  if (!listing || !locks) notFound();

  const meta = statusMeta(listing.status);
  const sellerRemoved = removedBySeller(listing);
  // Back from Save on the edit page, or here from Remove on the list.
  const saved = query.saved === "1" && locks.canEdit;
  const askToRemove = query.remove === "1" && locks.canRemove;
  // A lock worth explaining: a deal holds it, or it has sold. A removed
  // listing says so in its header instead.
  const lockText =
    locks.lock && locks.lock !== "removed" ? LOCK_TEXT[locks.lock] : null;
  const hasControls =
    locks.canRemove ||
    (locks.lock === null &&
      (listing.status === "LIVE" ||
        listing.status === "PAUSED" ||
        listing.status === "ADMIN_REVIEW"));
  const platformName =
    platforms.find((p) => p.id === listing.platform)?.name ?? listing.platform;
  const editable = EDITABLE.includes(listing.status);
  const verified = listing.ownershipVerifiedAt !== null;

  const showOwnership =
    !verified && listing.status !== "DRAFT" && listing.status !== "REMOVED";

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/listings", label: "Your listings" }}
        title={listing.title || listing.handle}
        description={
          // A returned listing's note says this, with the moderator's words,
          // just below — the line is not needed twice.
          listing.status === "REJECTED" && listing.rejectionReason
            ? undefined
            : sellerRemoved
              ? "You removed this listing. Buyers cannot see it."
              : meta.note
        }
        meta={
          <>
            <ListingStatusBadge status={listing.status} size="sm" />
            {verified ? (
              <Badge variant="verified">
                <BadgeCheckIcon aria-hidden="true" />
                Ownership verified
              </Badge>
            ) : listing.status === "DRAFT" ? null : (
              <Badge variant="neutral">
                <ShieldAlertIcon aria-hidden="true" />
                Not verified yet
              </Badge>
            )}
          </>
        }
        actions={
          locks.canEdit || listing.status === "LIVE" ? (
            <>
              {locks.canEdit ? (
                <Button asChild variant="secondary" size="md">
                  <Link href={`/dashboard/listings/${listing.id}/edit`}>
                    <PencilIcon aria-hidden="true" />
                    Edit
                  </Link>
                </Button>
              ) : null}
              {listing.status === "LIVE" ? (
                <Button asChild variant="secondary" size="md">
                  <Link href={`/listing/${listing.slug}`}>
                    View as a buyer
                    <ExternalLinkIcon aria-hidden="true" />
                  </Link>
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      />

      {saved ? (
        <AllClear
          className="mb-6"
          title="Changes saved"
          body={
            listing.status === "LIVE"
              ? "Buyers see them now."
              : "Buyers will see them when you put it back up."
          }
        />
      ) : null}

      <Card className="overflow-hidden">
        <div className="h-20 w-full border-b border-line bg-surface-2 sm:h-24">
          {listing.coverUrl ? (
            <>
              {/* biome-ignore lint/performance/noImgElement: the seller's own
                  cover upload, already sized for a listing card. */}
              <img
                src={listing.coverUrl}
                alt=""
                className="size-full object-cover"
              />
            </>
          ) : (
            <div className="flex size-full items-center justify-center gap-2 text-xs text-subtle">
              <ImageIcon aria-hidden="true" className="size-4" />
              No cover image yet
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 pb-4 sm:px-5">
          <div className="flex min-w-0 items-end gap-3">
            {listing.avatarUrl ? (
              <>
                {/* biome-ignore lint/performance/noImgElement: the account's
                    own avatar, drawn from the seller's upload at 80px. */}
                <img
                  src={listing.avatarUrl}
                  alt=""
                  width={80}
                  height={80}
                  className="-mt-7 size-14 shrink-0 rounded-lg border border-line bg-surface object-cover shadow-xs ring-4 ring-surface"
                />
              </>
            ) : (
              <span className="-mt-7 flex size-14 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-subtle shadow-xs ring-4 ring-surface">
                <ImageIcon aria-hidden="true" className="size-5" />
              </span>
            )}
            <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 pb-0.5 text-[0.8125rem] text-muted">
              <span className="font-medium text-fg capitalize">
                {platformName}
              </span>
              <Sep />
              <span className="break-all">{listing.handle}</span>
              <Sep />
              <span className="whitespace-nowrap">
                <span className="tabular-nums">
                  {listing.audience.toLocaleString("en-US")}
                </span>{" "}
                audience
              </span>
            </p>
          </div>
          <div className="pt-3 sm:text-right">
            <p className="text-xs text-subtle">Asking price</p>
            <p className="text-[1.375rem] leading-7 font-semibold tracking-[-0.02em] text-fg tabular-nums">
              {usd(listing.price)}
            </p>
            {listing.status === "LIVE" ? (
              <p className="text-xs text-subtle tabular-nums">
                {listing.watching} watching
              </p>
            ) : null}
          </div>
        </div>

        {/* Where it is on the road, and what that means. */}
        <ol className="grid grid-cols-4 gap-1.5 border-t border-line px-4 py-3.5 sm:gap-2 sm:px-5">
          {PIPELINE.map((stop, i) => {
            const at = AT[listing.status];
            const current = i === at;
            const passed = i < at;
            const stuck = current && STUCK.includes(listing.status);
            return (
              <li key={stop} aria-current={current ? "step" : undefined}>
                <span
                  className={cn(
                    "block h-1 rounded-full",
                    stuck
                      ? "bg-danger"
                      : passed
                        ? "bg-fg/70"
                        : current
                          ? (CURRENT_BAR[meta.variant ?? "neutral"] ??
                            "bg-fg/70")
                          : "bg-surface-3",
                  )}
                />
                <span
                  className={cn(
                    "mt-2 block text-xs",
                    stuck
                      ? "font-medium text-danger"
                      : current
                        ? "font-medium text-fg"
                        : passed
                          ? "text-muted"
                          : "text-subtle",
                  )}
                >
                  {stop}
                </span>
              </li>
            );
          })}
        </ol>
      </Card>

      {listing.status === "REMOVED" &&
      !sellerRemoved &&
      listing.rejectionReason ? (
        <Callout tone="danger" title="Why it was taken down" className="mt-6">
          <p className="max-w-[68ch] text-sm leading-relaxed text-fg">
            {listing.rejectionReason}
          </p>
          <p className="mt-2 max-w-[68ch]">
            If you think this is a mistake, contact support and a moderator can
            look at it again.
          </p>
        </Callout>
      ) : null}

      {listing.status === "REJECTED" && listing.rejectionReason ? (
        <Callout tone="danger" title="What needs changing" className="mt-6">
          <p className="max-w-[68ch] text-sm leading-relaxed text-fg">
            {listing.rejectionReason}
          </p>
          <p className="mt-2 max-w-[68ch]">
            Nothing is lost. Change what the note asks for in the form below,
            then press{" "}
            <span className="font-medium text-fg">
              Save and verify ownership
            </span>{" "}
            again to send it back. This note disappears as soon as you save.
          </p>
        </Callout>
      ) : null}

      {verified ? (
        <Section
          title="Ownership check"
          info={
            <>
              <p>This is the part buyers trust most.</p>
              <p className="mt-1.5">
                We read your code from the {platformName} account itself, so
                buyers see a verified badge on this listing.
              </p>
            </>
          }
        >
          <AllClear
            title={
              <>
                Ownership verified
                {listing.ownershipVerifiedAt ? (
                  <span className="font-normal text-muted">
                    {" "}
                    on {fullDay(listing.ownershipVerifiedAt)}
                  </span>
                ) : null}
              </>
            }
            body="You can take the code out of your description now."
          />
        </Section>
      ) : null}

      {showOwnership ? (
        <Section
          title="Ownership check"
          info={
            listing.status === "CODE_CHECK"
              ? "Until we can see the code, nothing goes in front of buyers."
              : listing.status === "ADMIN_REVIEW"
                ? // The panel says "A moderator is looking" itself; saying
                  // it twice in a hundred pixels reads as a glitch.
                  undefined
                : "This listing is not ownership-verified yet. Buyers trust a verified listing far more, and it only takes a minute."
          }
          actions={
            listing.status === "CODE_CHECK" ? <TurnFlag mine /> : undefined
          }
        >
          <OwnershipPanel
            listingId={listing.id}
            code={listing.ownershipCode}
            platform={listing.platform}
            status={listing.status}
            hasProof={listing.proofs.length > 0}
          />
        </Section>
      ) : null}

      {editable ? (
        <Section
          id="edit"
          title={
            listing.status === "REJECTED" ? "Fix and resend" : "The listing"
          }
          info={
            listing.status === "REJECTED"
              ? "Everything you sent is still here. Change what the note asks for and send it back."
              : "Everything buyers will see. Save a draft at any point."
          }
        >
          <ListingForm
            platforms={choices}
            listingId={listing.id}
            fees={fees}
            initial={{
              platform: listing.platform,
              handle: listing.handle,
              title: listing.title,
              niche: listing.niche,
              country: listing.country,
              audience: String(listing.audience),
              monetized: listing.monetized,
              monthlyRevenue: String(listing.monthlyRevenue),
              yearlyRevenue: String(listing.yearlyRevenue),
              engagement: String(listing.engagement),
              ageYears: String(listing.ageYears),
              price: String(listing.price),
              coverUrl: listing.coverUrl,
              avatarUrl: listing.avatarUrl,
              transferProfile: listing.transferProfile ?? "",
              sourceUrl: listing.sourceUrl ?? "",
              description: listing.description ?? "",
              whatsapp: listing.whatsapp ?? "",
              proofs: listing.proofs.map((p) => ({
                url: p.url,
                label: p.label,
                sha256: p.sha256,
              })),
            }}
          />
        </Section>
      ) : (
        <ReadOnlySummary
          listing={listing}
          platformName={platformName}
          info={
            locks.canEdit
              ? "Press Edit at the top to change what buyers see. Your changes show at once."
              : listing.status === "CODE_CHECK" ||
                  listing.status === "ADMIN_REVIEW"
                ? "Locked while this listing is with us. Pull it back to make changes."
                : undefined
          }
        />
      )}

      {hasControls || lockText ? (
        <Section
          id="manage"
          title="Manage this listing"
          info={lockText ? undefined : MANAGE_INFO[listing.status]}
        >
          {lockText ? (
            <Callout icon={LockIcon} title={lockText.title}>
              {lockText.body}
            </Callout>
          ) : (
            <Card padded>
              <ListingControls
                listingId={listing.id}
                status={listing.status}
                canRemove={locks.canRemove}
                deletes={locks.deletes}
                openOffers={locks.openOffers}
                unpaidDeals={locks.unpaidDeals}
                removeBlocked={
                  locks.paying && !locks.deletes
                    ? "A buyer is paying for it by crypto right now. You can remove it once that payment lands or runs out, within the hour."
                    : null
                }
                confirmFirst={askToRemove}
              />
            </Card>
          )}
        </Section>
      ) : null}
    </>
  );
}

function ReadOnlySummary({
  listing,
  platformName,
  info,
}: {
  listing: Listing;
  platformName: string;
  /** Whether, and how, these can be changed. */
  info?: string;
}) {
  const rows: [string, string][] = [
    ["Platform", platformName],
    ["Handle", listing.handle],
    ["Niche", listing.niche],
    ["Audience country", listing.country],
    ["Audience", listing.audience.toLocaleString("en-US")],
    ["Engagement", `${listing.engagement}%`],
    ["Account age", `${listing.ageYears} years`],
    ["Monetized", listing.monetized ? "Yes" : "No"],
    ["Monthly revenue", usd(listing.monthlyRevenue)],
    ["Asking price", usd(listing.price)],
  ];

  return (
    <Section title="The details" info={info}>
      <Card>
        <CardBody className="py-2 sm:py-2.5">
          <Facts columns={2}>
            {rows.map(([label, value], i) => (
              <Fact
                key={label}
                label={label}
                // Two columns: the last row of the left one closes the card
                // too, so it drops its rule like the very last row does.
                className={
                  rows.length % 2 === 0 && i === rows.length - 2
                    ? "sm:border-b-0"
                    : undefined
                }
              >
                {value}
              </Fact>
            ))}
          </Facts>
        </CardBody>

        {listing.description ? (
          <div className="border-t border-line p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-fg">
              About this account
            </h3>
            <p className="mt-1.5 max-w-[68ch] text-sm leading-relaxed whitespace-pre-line text-muted">
              {listing.description}
            </p>
          </div>
        ) : null}

        {listing.proofs.length > 0 ? (
          <div className="border-t border-line p-4 sm:p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
              Proof you sent
              <Count value={listing.proofs.length} label="screenshots" />
            </h3>
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {listing.proofs.map((proof) => (
                <li key={proof.id}>
                  {/* biome-ignore lint/performance/noImgElement: the seller's own
                      upload at thumbnail size. */}
                  <img
                    src={proof.url}
                    alt=""
                    width={160}
                    height={104}
                    className="h-[6.5rem] w-full rounded-lg border border-line bg-surface-2 object-cover"
                  />
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">
                    {proof.label}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>
    </Section>
  );
}
