import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ExternalLinkIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  RemoveListing,
  ReviewDecision,
} from "@/components/admin/review-decision";
import { ListingStatusBadge } from "@/components/dashboard/listing-status";
import { platforms } from "@/data/platforms";
import { getListingForReview } from "@/server/admin-listings";
import { getAuditTrail } from "@/server/audit";
import { requireStaff } from "@/server/session";

export const metadata: Metadata = {
  title: "Review listing",
  robots: { index: false, follow: false },
};

function usd(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default async function ReviewListingPage({
  params,
}: PageProps<"/admin/listings/[id]">) {
  await requireStaff();
  const { id } = await params;

  const listing = await getListingForReview(id);
  if (!listing) notFound();

  const trail = await getAuditTrail({ entity: "listing", entityId: id }, 10);
  const platform = platforms.find((p) => p.id === listing.platform);
  const duplicates = listing.proofs.filter((p) => p.alsoUsedOn.length > 0);

  const facts: [string, string][] = [
    [
      platform?.metricLabel ?? "Audience",
      listing.audience.toLocaleString("en-US"),
    ],
    ["Engagement", `${listing.engagement}%`],
    ["Account age", `${listing.ageYears} years`],
    ["Niche", listing.niche],
    ["Audience country", listing.country],
    ["Monetized", listing.monetized ? "Yes" : "No"],
    ["Monthly revenue", usd(listing.monthlyRevenue)],
    ["Asking price", usd(listing.price)],
  ];

  return (
    <>
      <Link
        href="/admin/listings"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        Queue
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <ListingStatusBadge status={listing.status} />
          <h1 className="mt-3 font-display text-2xl font-black tracking-tight text-fg sm:text-3xl">
            {listing.title}
          </h1>
          <p className="mt-1 text-sm text-subtle">
            {listing.handle} · {platform?.name ?? listing.platform}
          </p>
        </div>
        {listing.status === "LIVE" ? (
          <Link
            href={`/listing/${listing.slug}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-4 text-sm text-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            View live
            <ExternalLinkIcon aria-hidden="true" className="size-4" />
          </Link>
        ) : null}
      </div>

      {duplicates.length > 0 ? (
        <div className="mt-6 rounded-panel border border-danger/40 bg-danger-soft p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-fg">
            <AlertTriangleIcon
              aria-hidden="true"
              className="size-5 text-danger"
            />
            The same screenshot appears on another listing
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-fg">
            Identical files, byte for byte. At least one of these sellers does
            not own what they are selling.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {duplicates.flatMap((proof) =>
              proof.alsoUsedOn.map((other) => (
                <li key={`${proof.id}-${other.listingId}`} className="text-sm">
                  <span className="text-muted">
                    {proof.label || "Screenshot"} — also on{" "}
                  </span>
                  <Link
                    href={`/admin/listings/${other.listingId}`}
                    className="font-medium text-danger underline-offset-4 hover:underline"
                  >
                    {other.handle}
                  </Link>
                  <span className="text-muted"> by {other.sellerName}</span>
                </li>
              )),
            )}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-5">
          {/* ---- ownership ---- */}
          <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
            <h2 className="font-display text-lg font-bold text-fg">
              Ownership check
            </h2>
            <p className="mt-1.5 text-sm text-muted">
              Open the account and look for this code. If it is not there, send
              the listing back — a seller who cannot post to the profile does
              not control it.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <code className="rounded-xl border border-line bg-surface-2 px-4 py-3 font-mono text-base font-semibold tracking-wider text-fg">
                {listing.ownershipCode ?? "not issued"}
              </code>
              {listing.ownershipVerifiedAt ? (
                <span className="text-sm text-verified">
                  Confirmed{" "}
                  {listing.ownershipVerifiedAt.toLocaleDateString("en-GB")}
                </span>
              ) : null}
            </div>
          </section>

          {/* ---- what they claim ---- */}
          <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
            <h2 className="font-display text-lg font-bold text-fg">
              What the seller claims
            </h2>
            <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {facts.map(([label, value]) => (
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
            {listing.transferProfile ? (
              <p className="mt-4 text-sm text-muted">
                <span className="text-subtle">Handover notes: </span>
                {listing.transferProfile}
              </p>
            ) : null}
          </section>

          {/* ---- proof ---- */}
          <section className="rounded-panel border border-line bg-surface p-5 sm:p-6">
            <h2 className="font-display text-lg font-bold text-fg">
              Proof ({listing.proofs.length})
            </h2>
            {listing.proofs.length === 0 ? (
              <p className="mt-3 text-sm text-danger">
                Nothing attached. There is nothing here to check the numbers
                against.
              </p>
            ) : (
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {listing.proofs.map((proof) => (
                  <li key={proof.id}>
                    <a href={proof.url} target="_blank" rel="noreferrer">
                      {/* biome-ignore lint/performance/noImgElement: seller
                          uploads reviewed at full size; the optimiser adds
                          nothing here. */}
                      <img
                        src={proof.url}
                        alt={proof.label || "Proof screenshot"}
                        width={400}
                        height={240}
                        className={`w-full rounded-xl border object-cover ${
                          proof.alsoUsedOn.length > 0
                            ? "border-danger"
                            : "border-line"
                        }`}
                      />
                    </a>
                    <p className="mt-1.5 text-sm text-muted">
                      {proof.label || (
                        <span className="text-subtle">no label</span>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {listing.status === "ADMIN_REVIEW" ? (
            <ReviewDecision listingId={listing.id} />
          ) : null}

          {listing.status === "REJECTED" && listing.rejectionReason ? (
            <section className="rounded-panel border border-line bg-surface p-5">
              <h2 className="font-display text-base font-bold text-fg">
                Sent back with
              </h2>
              <p className="mt-2 text-sm text-muted">
                {listing.rejectionReason}
              </p>
            </section>
          ) : null}

          {listing.status === "LIVE" || listing.status === "PAUSED" ? (
            <RemoveListing listingId={listing.id} />
          ) : null}
        </div>

        {/* ---- who is selling ---- */}
        <aside className="flex flex-col gap-5">
          <section className="rounded-panel border border-line bg-surface p-5">
            <h2 className="font-display text-base font-bold text-fg">
              The seller
            </h2>
            <dl className="mt-3 flex flex-col gap-2.5 text-sm">
              <div>
                <dt className="text-xs text-subtle">Name</dt>
                <dd className="font-medium text-fg">{listing.seller.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Email</dt>
                <dd className="truncate text-fg">{listing.seller.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Identity check</dt>
                <dd
                  className={
                    listing.seller.kycStatus === "APPROVED"
                      ? "text-verified"
                      : "text-muted"
                  }
                >
                  {listing.seller.kycStatus.toLowerCase().replace("_", " ")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Member since</dt>
                <dd className="text-fg tabular-nums">
                  {listing.seller.joinedAt.toLocaleDateString("en-GB")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Track record</dt>
                <dd className="text-fg tabular-nums">
                  {listing.seller.completedSales} sold ·{" "}
                  {listing.seller.liveListings} live
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-panel border border-line bg-surface p-5">
            <h2 className="font-display text-base font-bold text-fg">
              History
            </h2>
            {trail.length === 0 ? (
              <p className="mt-3 text-sm text-subtle">
                No staff action on this listing yet.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2.5 text-sm">
                {trail.map((row) => (
                  <li key={row.id}>
                    <p className="text-fg">
                      {row.action.replace("listing.", "")}
                    </p>
                    <p className="text-xs text-subtle">
                      {row.actorName ?? "unknown"} ·{" "}
                      {row.createdAt.toLocaleString("en-GB")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
