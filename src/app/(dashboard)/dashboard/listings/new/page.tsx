import {
  BadgeCheckIcon,
  CameraIcon,
  ClockIcon,
  LinkIcon,
  LockIcon,
  TagIcon,
} from "lucide-react";
import type { Metadata } from "next";
import { Card, IconTile, PageHeader } from "@/components/app/kit";
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
  // The seller's side of the handover: they are the one listing.
  transferNote: p.sellerNote,
  tint: p.tint,
}));

/**
 * What to have open in another tab before starting.
 *
 * Said before the form rather than discovered inside it: the two things that
 * send people away mid-listing are a screenshot they have not taken and a
 * price they have not decided, and both are quicker to fetch than to guess.
 *
 * Names only. What each one is for is said where it is used — the link box,
 * the proof step and the price step below — so it is not said twice here.
 */
const NEEDED = [
  { icon: LinkIcon, title: "The link to your account" },
  { icon: CameraIcon, title: "A screenshot or two from inside it" },
  { icon: TagIcon, title: "A price in mind" },
];

const PROMISES = [
  { icon: LockIcon, label: "Private until you send it" },
  { icon: ClockIcon, label: "Save a draft at any point" },
  { icon: BadgeCheckIcon, label: "Free to list, no exclusivity" },
];

export default async function NewListingPage() {
  await requireUser("/dashboard/listings/new");
  const fees = await getFeeSettings();

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/listings", label: "Your listings" }}
        title="List an account"
        description="Free to list, and about ten minutes with the link to hand."
        info="Buyers see nothing until you have proved the account is yours. A YouTube channel then goes live at once."
      />

      <Card>
        <ul
          aria-label="Have these to hand"
          className="flex flex-wrap gap-x-6 gap-y-2.5 px-4 py-3 sm:px-5"
        >
          {NEEDED.map((item) => (
            <li
              key={item.title}
              className="inline-flex items-center gap-2.5 text-[0.8125rem] leading-5 font-medium text-fg"
            >
              <IconTile icon={item.icon} size="sm" />
              {item.title}
            </li>
          ))}
        </ul>
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-b-[inherit] border-t border-line bg-surface-2/50 px-4 py-2.5 sm:px-5">
          {PROMISES.map((point) => (
            <li
              key={point.label}
              className="inline-flex items-center gap-1.5 text-xs text-muted"
            >
              <point.icon
                aria-hidden="true"
                className="size-3.5 shrink-0 text-verified"
              />
              {point.label}
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-6">
        <ListingForm platforms={choices} listingId={null} fees={fees} />
      </div>
    </>
  );
}
