import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ListingForm,
  type PlatformChoice,
} from "@/components/dashboard/listing-form";
import { platforms } from "@/data/platforms";
import { requireUser } from "@/server/session";
import { getFeeSettings } from "@/server/settings";

export const metadata: Metadata = {
  title: "New listing",
  robots: { index: false, follow: false },
};

/**
 * Only the serialisable parts cross into the form. `platforms` carries an
 * `icon` component, and a function cannot be handed to a Client Component.
 */
const choices: PlatformChoice[] = platforms.map((p) => ({
  id: p.id,
  name: p.name,
  metricLabel: p.metricLabel,
  transferNote: p.transferNote,
}));

export default async function NewListingPage() {
  await requireUser("/dashboard/listings/new");
  const fees = await getFeeSettings();

  return (
    <>
      <Link
        href="/dashboard/listings"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        Your listings
      </Link>

      <h1 className="mt-3 font-display text-3xl font-black tracking-tight text-fg sm:text-4xl">
        New listing
      </h1>
      <p className="mt-3 max-w-[56ch] text-muted">
        Save a draft at any point — nothing is shown to buyers until you have
        proved the account is yours and a moderator has checked it.
      </p>

      <div className="mt-8">
        <ListingForm platforms={choices} listingId={null} fees={fees} />
      </div>
    </>
  );
}
