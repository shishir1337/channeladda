import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  FingerprintIcon,
  ImageIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Fact, Facts, Panel } from "@/components/admin/console";
import {
  RemoveListing,
  ReviewDecision,
} from "@/components/admin/review-decision";
import { auditLabel, ListingStatusTag, Waited } from "@/components/admin/vocab";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
import { platforms } from "@/data/platforms";
import { getListingForReview } from "@/server/admin-listings";
import { getAuditTrail } from "@/server/audit";
import { requireStaff } from "@/server/session";

export const metadata: Metadata = {
  title: "Review listing",
  robots: { index: false, follow: false },
};

function SubHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-display text-base font-bold text-fg">{children}</h2>
  );
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
  const inReview = listing.status === "ADMIN_REVIEW";

  const facts: [string, ReactNode][] = [
    [
      platform?.metricLabel ?? "Audience",
      listing.audience.toLocaleString("en-US"),
    ],
    ["Engagement", `${listing.engagement}%`],
    ["Account age", `${listing.ageYears} years`],
    ["Niche", listing.niche],
    ["Audience country", listing.country],
    ["Monetized", listing.monetized ? "Yes" : "No"],
    ["Monthly revenue", <Price key="rev" usd={listing.monthlyRevenue} />],
    ["Asking price", <Price key="price" usd={listing.price} />],
  ];

  return (
    <>
      <Link
        href="/admin/listings"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        Listing queue
      </Link>

      <header className="mt-2 border-b border-line pb-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ListingStatusTag status={listing.status} size="md" />
              <Badge className="capitalize">
                {platform?.name ?? listing.platform}
              </Badge>
              {inReview ? (
                <Waited
                  since={listing.updatedAt}
                  warnAfter={12}
                  lateAfter={24}
                />
              ) : null}
            </div>
            <h1 className="mt-3 font-display text-[1.6rem] leading-[1.1] font-black tracking-tight text-fg sm:text-[1.9rem]">
              {listing.title}
            </h1>
            <p className="mt-1.5 text-sm text-subtle">
              {listing.handle} · submitted{" "}
              {listing.createdAt.toLocaleDateString("en-GB")}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
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
        </div>
      </header>

      {duplicates.length > 0 ? (
        <Panel tone="danger" className="mt-5">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-fg">
            <TriangleAlertIcon
              aria-hidden="true"
              className="size-5 shrink-0 text-danger"
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
        </Panel>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {/* ---- ownership ---- */}
          <Panel>
            <SubHeading>
              <span className="flex items-center gap-2">
                <FingerprintIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-subtle"
                />
                Ownership check
              </span>
            </SubHeading>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Open the account and look for this code. If it is not there, send
              the listing back — a seller who cannot post to the profile does
              not control it.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <code className="rounded-card border border-line-strong bg-surface-2 px-4 py-3 font-mono text-base font-semibold tracking-wider text-fg select-all">
                {listing.ownershipCode ?? "not issued"}
              </code>
              {listing.ownershipVerifiedAt ? (
                <Badge variant="verified" size="md">
                  Confirmed{" "}
                  {listing.ownershipVerifiedAt.toLocaleDateString("en-GB")}
                </Badge>
              ) : (
                <Badge size="md">Not confirmed yet</Badge>
              )}
            </div>
          </Panel>

          {/* ---- what they claim ---- */}
          <Panel>
            <SubHeading>What the seller claims</SubHeading>
            <p className="mt-1.5 text-sm text-muted">
              Unverified until the proof below backs it up. Money is shown in
              whichever currency the header is set to.
            </p>
            <Facts className="mt-3">
              {facts.map(([label, value]) => (
                <Fact key={label} label={label}>
                  {value}
                </Fact>
              ))}
            </Facts>
            {listing.transferProfile ? (
              <p className="mt-4 text-sm leading-relaxed text-muted">
                <span className="text-subtle">Handover notes: </span>
                {listing.transferProfile}
              </p>
            ) : null}
          </Panel>

          {/* ---- proof ---- */}
          <Panel>
            <SubHeading>
              <span className="flex items-center gap-2">
                <ImageIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-subtle"
                />
                Proof ({listing.proofs.length})
              </span>
            </SubHeading>
            {listing.proofs.length === 0 ? (
              <p className="mt-3 flex items-start gap-2 rounded-card border border-danger/30 bg-danger-soft p-3 text-sm text-fg">
                <TriangleAlertIcon
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-danger"
                />
                Nothing attached. There is nothing here to check the numbers
                against, so there is nothing to approve.
              </p>
            ) : (
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {listing.proofs.map((proof) => (
                  <li key={proof.id}>
                    <a
                      href={proof.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                    >
                      {/* biome-ignore lint/performance/noImgElement: seller
                          uploads reviewed at full size; the optimiser adds
                          nothing here. */}
                      <img
                        src={proof.url}
                        alt={proof.label || "Proof screenshot"}
                        width={400}
                        height={240}
                        className={`w-full rounded-card border object-cover ${
                          proof.alsoUsedOn.length > 0
                            ? "border-danger"
                            : "border-line"
                        }`}
                      />
                    </a>
                    <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
                      {proof.label || (
                        <span className="text-subtle">no label</span>
                      )}
                      {proof.alsoUsedOn.length > 0 ? (
                        <Badge variant="danger">reused elsewhere</Badge>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {inReview ? <ReviewDecision listingId={listing.id} /> : null}

          {listing.status === "REJECTED" && listing.rejectionReason ? (
            <Panel>
              <SubHeading>Sent back with</SubHeading>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {listing.rejectionReason}
              </p>
            </Panel>
          ) : null}

          {listing.status === "LIVE" || listing.status === "PAUSED" ? (
            <RemoveListing listingId={listing.id} />
          ) : null}
        </div>

        {/* ---- who is selling ---- */}
        <aside className="flex min-w-0 flex-col gap-4">
          <Panel>
            <SubHeading>The seller</SubHeading>
            <dl className="mt-3 flex flex-col gap-2.5 text-sm">
              <div>
                <dt className="text-xs text-subtle">Name</dt>
                <dd className="font-medium text-fg">
                  <Link
                    href={`/admin/users/${listing.seller.id}`}
                    className="text-primary-text underline-offset-4 hover:underline"
                  >
                    {listing.seller.name}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Email</dt>
                <dd className="truncate text-fg">{listing.seller.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Identity check</dt>
                <dd>
                  <Badge
                    variant={
                      listing.seller.kycStatus === "APPROVED"
                        ? "verified"
                        : listing.seller.kycStatus === "REJECTED"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {listing.seller.kycStatus.toLowerCase().replace("_", " ")}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Member since</dt>
                <dd className="tnum text-fg">
                  {listing.seller.joinedAt.toLocaleDateString("en-GB")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Track record</dt>
                <dd className="tnum text-fg">
                  {listing.seller.completedSales} sold ·{" "}
                  {listing.seller.liveListings} live
                </dd>
              </div>
            </dl>
            {listing.seller.slug ? (
              <Link
                href={`/seller/${listing.seller.slug}`}
                className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-primary-text underline-offset-4 hover:underline"
              >
                Public seller page
                <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
              </Link>
            ) : null}
          </Panel>

          <Panel>
            <SubHeading>History</SubHeading>
            {trail.length === 0 ? (
              <p className="mt-3 text-sm text-subtle">
                No staff action on this listing yet.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3 text-sm">
                {trail.map((row) => (
                  <li
                    key={row.id}
                    className="border-b border-line pb-3 last:border-b-0 last:pb-0"
                  >
                    <p className="text-fg">{auditLabel(row.action)}</p>
                    <p className="mt-0.5 text-xs text-subtle">
                      {row.actorName ?? "unknown"} ·{" "}
                      <time dateTime={row.createdAt.toISOString()}>
                        {row.createdAt.toLocaleString("en-GB")}
                      </time>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
