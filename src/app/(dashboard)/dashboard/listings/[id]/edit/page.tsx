import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/app/kit";
import { LiveListingForm } from "@/components/dashboard/live-listing-form";
import { platforms } from "@/data/platforms";
import { getListingLocks, getMyListing } from "@/server/seller-listings";
import { requireUser } from "@/server/session";
import { getFeeSettings } from "@/server/settings";

export const metadata: Metadata = {
  title: "Edit listing",
  robots: { index: false, follow: false },
};

/**
 * Editing a listing that is on sale, or paused.
 *
 * Anything else goes back to the listing's own page, which says why it
 * cannot be edited here: a draft is edited there, one in review is pulled
 * back first, and a reserved or sold one is locked.
 */
export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/listings/${id}/edit`);

  const [listing, locks, fees] = await Promise.all([
    getMyListing(user.id, id),
    getListingLocks(user.id, id),
    getFeeSettings(),
  ]);
  if (!listing || !locks) notFound();
  if (!locks.canEdit) redirect(`/dashboard/listings/${id}`);

  const platform = platforms.find((p) => p.id === listing.platform);

  return (
    <>
      <PageHeader
        back={{
          href: `/dashboard/listings/${id}`,
          label: listing.title || listing.handle,
        }}
        title="Edit listing"
        description="Change what buyers see. It shows as soon as you save."
        info="There is no second review. Staff can see every change in the listing's history."
      />

      <LiveListingForm
        listingId={listing.id}
        fees={fees}
        account={{
          platform: platform?.name ?? listing.platform,
          handle: listing.handle,
          link: listing.sourceUrl,
          metricLabel: platform?.metricLabel ?? "Audience",
          transferNote: platform?.sellerNote,
        }}
        initial={{
          title: listing.title,
          niche: listing.niche,
          country: listing.country,
          description: listing.description ?? "",
          audience: String(listing.audience),
          engagement: String(listing.engagement),
          ageYears: String(listing.ageYears),
          monetized: listing.monetized,
          monthlyRevenue: String(listing.monthlyRevenue),
          yearlyRevenue: String(listing.yearlyRevenue),
          price: String(listing.price),
          coverUrl: listing.coverUrl || null,
          avatarUrl: listing.avatarUrl || null,
          transferProfile: listing.transferProfile ?? "",
          whatsapp: listing.whatsapp ?? "",
        }}
      />
    </>
  );
}
