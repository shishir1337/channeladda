import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
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
import { platforms } from "@/data/platforms";
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

  return (
    <>
      <Link
        href="/dashboard/listings"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        Your listings
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <ListingStatusBadge status={listing.status} />
          <h1 className="mt-3 font-display text-2xl font-black tracking-tight text-fg sm:text-3xl">
            {listing.title || listing.handle}
          </h1>
          <p className="mt-2 text-sm text-muted">{meta.note}</p>
        </div>

        {listing.status === "LIVE" ? (
          <Link
            href={`/listing/${listing.slug}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-4 text-sm text-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            View as a buyer
            <ExternalLinkIcon aria-hidden="true" className="size-4" />
          </Link>
        ) : null}
      </div>

      {listing.status === "REJECTED" && listing.rejectionReason ? (
        <div className="mt-6 rounded-panel border border-danger/30 bg-danger-soft p-5">
          <h2 className="font-display text-base font-bold text-fg">
            What needs changing
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-fg">
            {listing.rejectionReason}
          </p>
        </div>
      ) : null}

      {listing.status === "CODE_CHECK" && listing.ownershipCode ? (
        <div className="mt-6">
          <OwnershipStep
            listingId={listing.id}
            code={listing.ownershipCode}
            platformName={platformName}
            hasProof={listing.proofs.length > 0}
          />
        </div>
      ) : null}

      {editable ? (
        <div className="mt-8">
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
              engagement: String(listing.engagement),
              ageYears: String(listing.ageYears),
              price: String(listing.price),
              coverUrl: listing.coverUrl,
              avatarUrl: listing.avatarUrl,
              transferProfile: listing.transferProfile ?? "",
              proofs: listing.proofs.map((p) => ({
                url: p.url,
                label: p.label,
                sha256: p.sha256,
              })),
            }}
          />
        </div>
      ) : (
        <ReadOnlySummary listing={listing} platformName={platformName} />
      )}

      <div className="mt-8">
        <ListingControls listingId={listing.id} status={listing.status} />
      </div>
    </>
  );
}

function ReadOnlySummary({
  listing,
  platformName,
}: {
  listing: NonNullable<Awaited<ReturnType<typeof getMyListing>>>;
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
    [
      "Monthly revenue",
      listing.monthlyRevenue.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }),
    ],
    [
      "Asking price",
      listing.price.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }),
    ],
  ];

  return (
    <div className="mt-8 rounded-panel border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold text-fg">The details</h2>
      <p className="mt-1.5 text-sm text-muted">
        Locked while this listing is with us. Pull it back to make changes.
      </p>
      <dl className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex justify-between gap-4 border-b border-line-soft pb-2"
          >
            <dt className="text-sm text-subtle">{label}</dt>
            <dd className="text-sm font-medium text-fg tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {listing.proofs.length > 0 ? (
        <>
          <h3 className="mt-6 text-sm font-semibold text-fg">
            Proof you sent ({listing.proofs.length})
          </h3>
          <ul className="mt-3 flex flex-wrap gap-3">
            {listing.proofs.map((proof) => (
              <li key={proof.id} className="w-28">
                {/* biome-ignore lint/performance/noImgElement: the seller's own
                    upload at thumbnail size. */}
                <img
                  src={proof.url}
                  alt=""
                  width={112}
                  height={72}
                  className="h-[4.5rem] w-28 rounded-lg border border-line object-cover"
                />
                <p className="mt-1 truncate text-xs text-subtle">
                  {proof.label}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
