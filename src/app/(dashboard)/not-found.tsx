import { CompassIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/app/kit";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Not found",
  robots: { index: false, follow: false },
};

/**
 * Handles `notFound()` thrown inside the (dashboard) group — most often a
 * listing id that belongs to somebody else.
 *
 * Without this, the root not-found would render here instead, and because that
 * one draws the chrome itself the page would end up with two `<main id="main">`
 * elements nested inside each other. This one is only the page's content, so
 * it sits inside the app shell like any other dashboard page.
 */
export default function DashboardNotFound() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center py-6">
      {/* The empty state's title is a paragraph, so the page's one heading
          is given to screen readers here. */}
      <h1 className="sr-only">Page not found</h1>
      <EmptyState
        icon={CompassIcon}
        title="This page has been sold, moved or never existed"
        body="If you followed a link to a listing, it may have been withdrawn by the seller or already sold."
        action={
          <>
            <Button asChild size="md">
              <Link href="/dashboard">Back to overview</Link>
            </Button>
            <Button asChild size="md" variant="secondary">
              <Link href="/browse">Browse accounts</Link>
            </Button>
          </>
        }
        className="w-full max-w-lg py-14"
      />
    </div>
  );
}
