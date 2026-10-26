import {
  ExternalLinkIcon,
  FingerprintIcon,
  HistoryIcon,
  ImageIcon,
  StarIcon,
  TriangleAlertIcon,
  UserRoundIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { WhatsAppContact } from "@/components/admin/dispute-contact";
import {
  FeatureListing,
  RemoveListing,
  ReopenListing,
  ReviewDecision,
} from "@/components/admin/review-decision";
import {
  auditLabel,
  LISTING_STATUS,
  ListingStatusTag,
  listingEditLines,
  Waited,
} from "@/components/admin/vocab";
import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Count,
  Fact,
  Facts,
  MetaItem,
  PageHeader,
} from "@/components/app/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { platforms } from "@/data/platforms";
import { removedBySeller } from "@/lib/listing-lock";
import { countOf } from "@/lib/plural";
import { revenueLine } from "@/lib/revenue-line";
import { dayAndTime, longDate } from "@/lib/time";
import { getListingForReview } from "@/server/admin-listings";
import { getAuditTrail } from "@/server/audit";
import { requireStaff } from "@/server/session";
import { viewerZone } from "@/server/viewer-zone";

export const metadata: Metadata = {
  title: "Review listing",
  robots: { index: false, follow: false },
};

/** A quiet in-text link: the colour stays with the words, the rule says "link". */
const textLink =
  "font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-fg";

/**
 * Two-column facts end on a row of two, and both of that row's hairlines have
 * to go — the kit drops only the very last one.
 */
const pairedFacts = "sm:[&>*:nth-last-child(2):nth-child(odd)]:border-b-0";

export default async function ReviewListingPage({
  params,
}: PageProps<"/admin/listings/[id]">) {
  const staff = await requireStaff();
  const { id } = await params;
  const zone = await viewerZone();

  const listing = await getListingForReview(id);
  if (!listing) notFound();

  const trail = await getAuditTrail({ entity: "listing", entityId: id }, 10);
  const platform = platforms.find((p) => p.id === listing.platform);
  const duplicates = listing.proofs.filter((p) => p.alsoUsedOn.length > 0);
  const inReview = listing.status === "ADMIN_REVIEW";
  // Every decision on this page is `requireRole("MODERATOR")` on the server,
  // which SUPERADMIN also passes. Finance can read the page — the guard above
  // is `requireStaff` — but a button that can only ever be refused is not a
  // control, so the decisions are drawn for the people who can make them.
  const canModerate = staff.role === "MODERATOR" || staff.role === "SUPERADMIN";

  const revenue = revenueLine(listing);
  const facts: [string, ReactNode][] = [
    [
      platform?.metricLabel ?? "Audience",
      listing.audience.toLocaleString("en-US"),
    ],
    ["Engagement", `${listing.engagement}%`],
    ["Account age", countOf(listing.ageYears, "year")],
    ["Niche", listing.niche],
    ["Audience country", listing.country],
    ["Monetized", listing.monetized ? "Yes" : "No"],
    [
      "Monthly revenue",
      revenue.kind === "revenue" ? (
        <Price key="rev" usd={revenue.usd} />
      ) : revenue.kind === "monetized" ? (
        "Monetized, no figure given"
      ) : (
        "Not monetized"
      ),
    ],
    ["Asking price", <Price key="price" usd={listing.price} />],
  ];

  const sentBack =
    listing.status === "REJECTED" && Boolean(listing.rejectionReason);
  const removed = listing.status === "REMOVED";
  const readOnlyNote =
    !canModerate &&
    (inReview ||
      listing.status === "LIVE" ||
      listing.status === "PAUSED" ||
      listing.status === "REMOVED");
  // The side column holds where the listing stands and what can be done about
  // it. A status with neither — reserved, sold, waiting on the seller's code —
  // still gets a card there, so the layout never shows an empty column.
  const hasSide =
    (inReview && canModerate) ||
    sentBack ||
    removed ||
    (canModerate &&
      (listing.status === "LIVE" || listing.status === "PAUSED")) ||
    readOnlyNote;
  const PlatformIcon = platform?.icon;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/listings", label: "Listing queue" }}
        title={listing.title}
        meta={
          <>
            <ListingStatusTag status={listing.status} />
            <Badge className="capitalize">
              {PlatformIcon ? <PlatformIcon aria-hidden="true" /> : null}
              {platform?.name ?? listing.platform}
            </Badge>
            {listing.featured ? (
              <Badge variant="primary">
                <StarIcon aria-hidden="true" />
                Featured
              </Badge>
            ) : null}
            <span className="text-muted">{listing.handle}</span>
            <MetaItem label="Submitted">
              {longDate(listing.createdAt, zone)}
            </MetaItem>
            {inReview ? (
              <Waited since={listing.updatedAt} warnAfter={12} lateAfter={24} />
            ) : null}
          </>
        }
        actions={
          listing.status === "LIVE" ? (
            <Button asChild variant="outline" size="md">
              <Link href={`/listing/${listing.slug}`}>
                View live
                <ExternalLinkIcon aria-hidden="true" />
              </Link>
            </Button>
          ) : null
        }
      />

      {duplicates.length > 0 ? (
        <Callout
          tone="danger"
          title="The same screenshot appears on another listing"
          className="mb-6"
        >
          <p className="text-fg">
            Identical files, byte for byte. At least one of these sellers does
            not own what they are selling.
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {duplicates.flatMap((proof) =>
              proof.alsoUsedOn.map((other) => (
                <li key={`${proof.id}-${other.listingId}`}>
                  {proof.label || "Screenshot"} — also on{" "}
                  <Link
                    href={`/admin/listings/${other.listingId}`}
                    className="font-medium text-danger underline decoration-danger/40 underline-offset-4 transition-colors hover:decoration-danger"
                  >
                    {other.handle}
                  </Link>{" "}
                  by {other.sellerName}
                </li>
              )),
            )}
          </ul>
        </Callout>
      ) : null}

      {/*
       * Three blocks, in reading order: the evidence, then the decision, then
       * who is selling and what staff have done. On a wide screen the
       * decision moves into its own column and stays in view while the proof
       * scrolls past; on a phone it sits straight after the proof.
       */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_21.5rem]">
        {/* ---- the evidence ---- */}
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <Card>
            <CardHeader
              as="h2"
              icon={FingerprintIcon}
              title="Ownership check"
              description="Open the account and look for this code. If it is not there, send the listing back — a seller who cannot post to the profile does not control it."
            />
            <CardBody className="flex flex-wrap items-center gap-3">
              <code className="rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-[0.9375rem] leading-6 font-medium tracking-wider text-fg select-all">
                {listing.ownershipCode ?? "not issued"}
              </code>
              {listing.ownershipVerifiedAt ? (
                <Badge variant="verified" size="md">
                  Confirmed {longDate(listing.ownershipVerifiedAt, zone)}
                </Badge>
              ) : (
                <Badge size="md">Not confirmed yet</Badge>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              as="h2"
              title="What the seller claims"
              description="Unverified until the proof below backs it up."
              info="Money is shown in whichever currency the header is set to."
            />
            <CardBody className="py-1.5 sm:py-1.5">
              <Facts columns={2} className={pairedFacts}>
                {facts.map(([label, value]) => (
                  <Fact key={label} label={label}>
                    {value}
                  </Fact>
                ))}
              </Facts>
            </CardBody>
            {/* What buyers read under the figures, as they read it. It was
                never on this page, so a listing went on sale with words no
                moderator had seen. */}
            {listing.description ? (
              <div className="border-t border-line px-4 py-4 sm:px-5">
                <p className="text-xs font-medium text-muted">
                  About this account
                </p>
                <p className="mt-1.5 max-w-[72ch] text-sm leading-[1.6] break-words whitespace-pre-line text-fg">
                  {listing.description}
                </p>
              </div>
            ) : null}
            {listing.transferProfile ? (
              <div className="border-t border-line px-4 py-4 sm:px-5">
                <p className="text-xs font-medium text-muted">Handover notes</p>
                <p className="mt-1.5 max-w-[72ch] text-sm leading-[1.6] break-words whitespace-pre-line text-fg">
                  {listing.transferProfile}
                </p>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader
              as="h2"
              icon={ImageIcon}
              title={
                <span className="inline-flex items-center gap-2">
                  Proof
                  <Count value={listing.proofs.length} label="screenshots" />
                </span>
              }
            />
            <CardBody>
              {listing.proofs.length === 0 ? (
                <p className="flex items-start gap-2.5 text-sm leading-relaxed text-fg">
                  <TriangleAlertIcon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-danger"
                  />
                  Nothing attached. There is nothing here to check the numbers
                  against, so there is nothing to approve.
                </p>
              ) : (
                <ul className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                  {listing.proofs.map((proof) => {
                    const reused = proof.alsoUsedOn.length > 0;
                    return (
                      <li key={proof.id} className="min-w-0">
                        <a
                          href={proof.url}
                          target="_blank"
                          rel="noreferrer"
                          className={`group relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border bg-surface-2 transition-colors duration-150 ${
                            reused
                              ? "border-danger"
                              : "border-line hover:border-line-strong"
                          }`}
                        >
                          {/* biome-ignore lint/performance/noImgElement: seller
                              uploads reviewed at full size; the optimiser adds
                              nothing here. */}
                          <img
                            src={proof.url}
                            alt={proof.label || "Proof screenshot"}
                            width={400}
                            height={240}
                            // Contained, never cropped: a number cut off at
                            // the edge of a thumbnail is evidence nobody saw.
                            className="size-full object-contain transition-opacity duration-150 group-hover:opacity-90"
                          />
                          <span
                            aria-hidden="true"
                            className="absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-md border border-line bg-surface/90 text-muted opacity-0 shadow-xs transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                          >
                            <ExternalLinkIcon className="size-3.5" />
                          </span>
                        </a>
                        <p className="mt-2 flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted">
                          {proof.label || (
                            <span className="text-subtle">No label</span>
                          )}
                          {reused ? (
                            <Badge variant="danger">Reused elsewhere</Badge>
                          ) : null}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        {/* ---- where it stands, and the decision ---- */}
        <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="no-scrollbar flex flex-col gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
            {inReview && canModerate ? (
              <ReviewDecision listingId={listing.id} />
            ) : null}

            {sentBack ? (
              <Card>
                <CardHeader as="h2" title="Sent back with" />
                <CardBody>
                  <p className="text-sm leading-[1.6] break-words text-fg">
                    {listing.rejectionReason}
                  </p>
                </CardBody>
              </Card>
            ) : null}

            {removed ? (
              <Card tone="danger">
                <CardHeader
                  as="h2"
                  title={
                    removedBySeller(listing)
                      ? "Removed by the seller"
                      : "Taken down"
                  }
                  info="Hidden from buyers and locked for the seller, who cannot edit or resubmit it. Only staff can bring it back."
                  className="border-danger/15"
                />
                <CardBody>
                  <p className="text-sm leading-[1.6] break-words text-fg">
                    {listing.rejectionReason ?? (
                      <span className="text-muted">
                        No reason is on the listing. The history panel has who
                        took it down and when.
                      </span>
                    )}
                  </p>
                </CardBody>
              </Card>
            ) : null}

            {listing.status === "LIVE" && canModerate ? (
              <FeatureListing
                listingId={listing.id}
                featured={listing.featured}
              />
            ) : null}

            {(listing.status === "LIVE" || listing.status === "PAUSED") &&
            canModerate ? (
              <RemoveListing listingId={listing.id} />
            ) : null}

            {listing.status === "REMOVED" && canModerate ? (
              <ReopenListing listingId={listing.id} />
            ) : null}

            {readOnlyNote ? (
              <Callout title="Listing decisions are made by moderators.">
                Everything they see is on this page.
              </Callout>
            ) : null}

            {hasSide ? null : (
              <Card padded>
                <ListingStatusTag status={listing.status} />
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
                  {LISTING_STATUS[listing.status].note}
                </p>
              </Card>
            )}
          </div>
        </div>

        {/* ---- who is selling, and what staff have done ---- */}
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-2">
          <Card>
            <CardHeader
              as="h2"
              icon={UserRoundIcon}
              title="The seller"
              actions={
                listing.seller.slug ? (
                  <Link
                    href={`/seller/${listing.seller.slug}`}
                    className="group inline-flex min-h-11 items-center gap-1 rounded-md text-[0.8125rem] font-medium text-muted transition-colors hover:text-fg pointer-fine:min-h-6"
                  >
                    Public seller page
                    <ExternalLinkIcon
                      aria-hidden="true"
                      className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    />
                  </Link>
                ) : null
              }
            />
            <CardBody className="py-1.5 sm:py-1.5">
              <Facts columns={2} className={pairedFacts}>
                <Fact label="Name">
                  <Link
                    href={`/admin/users/${listing.seller.id}`}
                    className={textLink}
                  >
                    {listing.seller.name}
                  </Link>
                </Fact>
                <Fact label="Email">
                  <span className="font-normal">{listing.seller.email}</span>
                </Fact>
                <Fact
                  label={
                    <>
                      WhatsApp <span className="text-subtle">· staff only</span>
                    </>
                  }
                >
                  <span className="font-normal">
                    <WhatsAppContact
                      number={listing.whatsapp}
                      name={listing.seller.name}
                    />
                  </span>
                </Fact>
                <Fact label="Identity check">
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
                </Fact>
                <Fact label="Member since">
                  {longDate(listing.seller.joinedAt, zone)}
                </Fact>
                <Fact label="Track record">
                  {listing.seller.completedSales} sold ·{" "}
                  {listing.seller.liveListings} live
                </Fact>
              </Facts>
            </CardBody>
          </Card>

          <Card>
            <CardHeader as="h2" icon={HistoryIcon} title="History" />
            <CardBody>
              {trail.length === 0 ? (
                <p className="text-[0.8125rem] text-muted">
                  Nothing recorded on this listing yet.
                </p>
              ) : (
                <ol>
                  {trail.map((row, index) => (
                    <li key={row.id} className="relative pb-4 pl-5 last:pb-0">
                      {index < trail.length - 1 ? (
                        <span
                          aria-hidden="true"
                          className="absolute top-4 bottom-0 left-[3px] w-px bg-line"
                        />
                      ) : null}
                      <span
                        aria-hidden="true"
                        className="absolute top-[0.4375rem] left-0 size-[7px] rounded-full border border-line-strong bg-surface"
                      />
                      <p className="text-sm leading-5 text-fg">
                        <span className="font-medium">
                          {row.actorName ?? "Unknown"}
                        </span>{" "}
                        <span className="text-muted">
                          {auditLabel(row.action)}
                        </span>
                      </p>
                      {row.action === "listing.edit" ? (
                        <ul className="mt-1 flex flex-col gap-0.5 text-xs leading-relaxed break-words text-muted">
                          {listingEditLines(row.before, row.after).map(
                            (line) => (
                              <li key={line}>{line}</li>
                            ),
                          )}
                        </ul>
                      ) : null}
                      <p className="mt-0.5 text-xs text-subtle">
                        <time
                          dateTime={row.createdAt.toISOString()}
                          className="tnum"
                        >
                          {dayAndTime(row.createdAt, zone)}
                        </time>
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
