import { HeartIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/app/kit";
import {
  SavedListings,
  SavedSummary,
} from "@/components/dashboard/saved-listings";
import { ListingCard } from "@/components/home/listing-card";
import { Button } from "@/components/ui/button";
import { getSavedListings } from "@/server/listings";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Saved",
  robots: { index: false, follow: false },
};

/**
 * The listings this member saved with the heart.
 *
 * The heart saved them and nothing ever showed them again. The same cards
 * as Browse, so a saved listing looks like the one that was saved; the heart
 * on each takes it off this list, at once (`SavedListings`).
 */
export default async function SavedPage() {
  const user = await requireUser("/dashboard/saved");
  const listings = await getSavedListings(user.id);

  return (
    <>
      <PageHeader
        title="Saved"
        description={
          listings.length > 0 ? (
            <SavedSummary listingIds={listings.map((l) => l.id)} />
          ) : undefined
        }
        actions={
          <Button asChild variant="secondary" size="md">
            <Link href="/browse">Browse accounts</Link>
          </Button>
        }
      />

      <SavedListings
        items={listings.map((listing) => ({
          id: listing.id,
          card: <ListingCard listing={listing} phoneRow />,
        }))}
        empty={
          <EmptyState
            icon={HeartIcon}
            title="Nothing saved yet"
            info="Tap the heart on any listing to keep it here. A listing that sells or is taken down drops off the list."
            action={
              <Button asChild size="sm">
                <Link href="/browse">Find an account</Link>
              </Button>
            }
          />
        }
      />
    </>
  );
}
