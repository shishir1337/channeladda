import {
  ArrowLeftIcon,
  BadgeCheckIcon,
  CircleAlertIcon,
  ExternalLinkIcon,
  ImageIcon,
  LinkIcon,
  ShieldAlertIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ListingControls,
  OwnershipStep,
} from "@/components/dashboard/listing-actions";
import {
  ListingForm,
  type PlatformChoice,
} from "@/components/dashboard/listing-form";
import {
  ListingStatusBadge,
  statusMeta,
} from "@/components/dashboard/listing-status";
import { OwnershipCheck } from "@/components/dashboard/ownership-check";
import { Section } from "@/components/dashboard/page-parts";
import { Badge } from "@/components/ui/badge";
import { platforms } from "@/data/platforms";
import type { ListingStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { EDITABLE, getMyListing } from "@/server/seller-listings";
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
}));

type Listing = NonNullable<Awaited<ReturnType<typeof getMyListing>>>;

function usd(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
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

/** Statuses that give the seller something to press. */
const HAS_CONTROLS: readonly ListingStatus[] = [
  "DRAFT",
  "REJECTED",
  "ADMIN_REVIEW",
  "LIVE",
  "PAUSED",
];

export default async function SellerListingPage({
  params,
}: PageProps<"/dashboard/listings/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/listings/${id}`);

  // Scoped to the owner, so somebody else's id is indistinguishable from one
  // that does not exist.
  const [listing, fees] = await Promise.all([
    getMyListing(user.id, id),
    getFeeSettings(),
  ]);
  if (!listing) notFound();

  const meta = statusMeta(listing.status);
  const platformName =
    platforms.find((p) => p.id === listing.platform)?.name ?? listing.platform;
  const editable = EDITABLE.includes(listing.status);
  const verified = listing.ownershipVerifiedAt !== null;

  // The automatic read-back only exists for YouTube. On every other platform
  // a person does it, and the slower path must not be the hidden one.
  const autoCheckable = listing.platform === "youtube";

  const showOwnership =
    !verified && listing.status !== "DRAFT" && listing.status !== "REMOVED";

  return (
    <>
      <Link
        href="/dashboard/listings"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        Your listings
      </Link>

      <div className="mt-2 overflow-hidden rounded-panel border border-line bg-surface">
        <div className="h-20 w-full bg-surface-2 sm:h-28">
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

        <div className="px-4 pb-5 sm:px-6 sm:pb-6">
          <div className="-mt-8 flex flex-wrap items-end gap-4 sm:-mt-10">
            {listing.avatarUrl ? (
              <>
                {/* biome-ignore lint/performance/noImgElement: the account's
                    own avatar, drawn from the seller's upload at 80px. */}
                <img
                  src={listing.avatarUrl}
                  alt=""
                  width={80}
                  height={80}
                  className="size-16 shrink-0 rounded-2xl border border-line bg-surface object-cover sm:size-20"
                />
              </>
            ) : (
              <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface text-subtle sm:size-20">
                <ImageIcon aria-hidden="true" className="size-5" />
              </span>
            )}
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <ListingStatusBadge status={listing.status} />
              {verified ? (
                <Badge variant="verified" size="md">
                  <BadgeCheckIcon aria-hidden="true" />
                  Ownership verified
                </Badge>
              ) : listing.status === "DRAFT" ? null : (
                <Badge variant="neutral" size="md">
                  <ShieldAlertIcon aria-hidden="true" />
                  Not verified yet
                </Badge>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-black tracking-tight text-fg sm:text-3xl">
                {listing.title || listing.handle}
              </h1>
              <p className="mt-2 text-sm text-muted">
                <span className="capitalize">{platformName}</span> ·{" "}
                {listing.handle} ·{" "}
                <span className="tnum">
                  {listing.audience.toLocaleString("en-US")}
                </span>{" "}
                audience
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs text-subtle">Asking price</p>
              <p className="tnum font-display text-2xl font-black text-fg">
                {usd(listing.price)}
              </p>
              {listing.status === "LIVE" ? (
                <p className="tnum text-xs text-subtle">
                  {listing.watching} watching
                </p>
              ) : null}
            </div>
          </div>

          {/* Where it is on the road, and what that means. */}
          <ol className="mt-5 grid grid-cols-4 gap-1.5 sm:gap-2.5">
            {PIPELINE.map((stop, i) => {
              const at = AT[listing.status];
              const current = i === at;
              const passed = i < at;
              const stuck = current && STUCK.includes(listing.status);
              return (
                <li key={stop} aria-current={current ? "step" : undefined}>
                  <span
                    className={cn(
                      "block h-1.5 rounded-full",
                      stuck
                        ? "bg-danger"
                        : passed
                          ? "bg-verified"
                          : current
                            ? "bg-primary"
                            : "bg-surface-3",
                    )}
                  />
                  <span
                    className={cn(
                      "mt-2 block text-[0.6875rem] sm:text-xs",
                      stuck
                        ? "font-semibold text-danger"
                        : current
                          ? "font-semibold text-fg"
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

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="max-w-[60ch] text-sm leading-relaxed text-muted">
              {meta.note}
            </p>
            {listing.status === "LIVE" ? (
              <Link
                href={`/listing/${listing.slug}`}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-line px-4 text-sm text-muted transition-colors hover:border-line-strong hover:text-fg"
              >
                View as a buyer
                <ExternalLinkIcon aria-hidden="true" className="size-4" />
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      {listing.status === "REJECTED" && listing.rejectionReason ? (
        <div className="mt-6 rounded-panel border border-danger/30 bg-danger-soft p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-fg sm:text-lg">
            <CircleAlertIcon
              aria-hidden="true"
              className="size-[1.15rem] shrink-0 text-danger"
            />
            What needs changing
          </h2>
          <p className="mt-2.5 max-w-[68ch] text-sm leading-relaxed text-fg">
            {listing.rejectionReason}
          </p>
          <p className="mt-3 border-t border-danger/20 pt-3 text-sm leading-relaxed text-muted">
            Nothing is lost. Change what the note asks for in the form below,
            then press{" "}
            <span className="text-fg">Save and verify ownership</span> again to
            send it back. This note disappears as soon as you save.
          </p>
        </div>
      ) : null}

      {verified ? (
        <Section
          title="Ownership check"
          description="Done. This is the part buyers trust most."
        >
          <div className="rounded-panel border border-verified/30 bg-verified-soft p-5 sm:p-6">
            <p className="flex items-center gap-2 font-display text-base font-bold text-fg">
              <BadgeCheckIcon
                aria-hidden="true"
                className="size-[1.15rem] shrink-0 text-verified"
              />
              Ownership verified
              {listing.ownershipVerifiedAt ? (
                <span className="text-sm font-normal text-muted">
                  on {fullDay(listing.ownershipVerifiedAt)}
                </span>
              ) : null}
            </p>
            <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-muted">
              We read your code from the {platformName} account itself, so
              buyers see a verified badge on this listing. You can take the code
              out of your description now.
            </p>
          </div>
        </Section>
      ) : null}

      {showOwnership ? (
        <Section
          title="Ownership check"
          description={
            listing.status === "CODE_CHECK"
              ? "Your move. Until we can see the code, nothing goes in front of buyers."
              : listing.status === "ADMIN_REVIEW"
                ? "A moderator is looking. Leave the code where it is until this clears."
                : "This listing is not ownership-verified yet. Buyers trust a verified listing far more, and it only takes a minute."
          }
        >
          <div className="flex flex-col gap-3">
            {!autoCheckable ? (
              <p className="flex items-start gap-2.5 rounded-card border border-info/30 bg-info-soft p-3.5 text-sm leading-relaxed text-fg">
                <LinkIcon
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-info"
                />
                <span>
                  {platformName} has no public way for us to read your
                  description automatically, so a moderator checks this one by
                  hand. Put the code in place, then use the second panel to tell
                  us it is there.
                </span>
              </p>
            ) : null}

            <OwnershipCheck
              listingId={listing.id}
              code={listing.ownershipCode}
              verified={verified}
            />

            {listing.status === "CODE_CHECK" && listing.ownershipCode ? (
              // Two routes to the same place: we read the code, or a person
              // does. The automatic one leads unless it cannot work here.
              <details
                open={!autoCheckable}
                className="group rounded-panel border border-dashed border-line-strong"
              >
                {/* list-none alone leaves the triangle in Safari, which is
                    most of the phones this is read on. */}
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-medium text-fg [&::-webkit-details-marker]:hidden">
                  <span>
                    {autoCheckable
                      ? "The code is in place but the check cannot see it"
                      : "Tell us the code is in place"}
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-xs text-subtle group-open:hidden"
                  >
                    Open
                  </span>
                </summary>
                <div className="px-3 pb-3 sm:px-4 sm:pb-4">
                  <OwnershipStep
                    listingId={listing.id}
                    code={listing.ownershipCode}
                    platformName={platformName}
                    hasProof={listing.proofs.length > 0}
                  />
                </div>
              </details>
            ) : null}
          </div>
        </Section>
      ) : null}

      {editable ? (
        <Section
          title={
            listing.status === "REJECTED" ? "Fix and resend" : "The listing"
          }
          description={
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
        <ReadOnlySummary listing={listing} platformName={platformName} />
      )}

      {HAS_CONTROLS.includes(listing.status) ? (
        <Section
          title="Manage this listing"
          description={
            listing.status === "LIVE"
              ? "Pausing hides it from buyers without losing anything."
              : listing.status === "ADMIN_REVIEW"
                ? "Pulling it back turns it into a draft you can edit again."
                : undefined
          }
        >
          <ListingControls listingId={listing.id} status={listing.status} />
        </Section>
      ) : (
        <div className="mt-8">
          <ListingControls listingId={listing.id} status={listing.status} />
        </div>
      )}
    </>
  );
}

function ReadOnlySummary({
  listing,
  platformName,
}: {
  listing: Listing;
  platformName: string;
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
    <Section
      title="The details"
      description="Locked while this listing is with us. Pull it back to make changes."
    >
      <div className="rounded-panel border border-line bg-surface p-5 sm:p-6">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="flex justify-between gap-4 border-b border-line pb-2"
            >
              <dt className="text-sm text-subtle">{label}</dt>
              <dd className="tnum text-sm font-medium text-fg">{value}</dd>
            </div>
          ))}
        </dl>

        {listing.description ? (
          <>
            <h3 className="mt-6 text-sm font-semibold text-fg">
              About this account
            </h3>
            <p className="mt-2 max-w-[68ch] text-sm leading-relaxed whitespace-pre-line text-muted">
              {listing.description}
            </p>
          </>
        ) : null}

        {listing.proofs.length > 0 ? (
          <>
            <h3 className="mt-6 text-sm font-semibold text-fg">
              Proof you sent (
              <span className="tnum">{listing.proofs.length}</span>)
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
                    className="h-[6.5rem] w-full rounded-lg border border-line object-cover"
                  />
                  <p className="mt-1.5 text-xs leading-relaxed text-subtle">
                    {proof.label}
                  </p>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </Section>
  );
}
