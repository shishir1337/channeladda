import {
  ArrowLeftIcon,
  BadgeCheckIcon,
  CameraIcon,
  ClockIcon,
  LinkIcon,
  LockIcon,
  TagIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ListingForm,
  type PlatformChoice,
} from "@/components/dashboard/listing-form";
import { PageHead } from "@/components/dashboard/page-parts";
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

/**
 * What to have open in another tab before starting.
 *
 * Said before the form rather than discovered inside it: the two things that
 * send people away mid-listing are a screenshot they have not taken and a
 * price they have not decided, and both are quicker to fetch than to guess.
 */
const NEEDED = [
  {
    icon: LinkIcon,
    title: "The link to your account",
    body: "Paste it and we fill in the name, the picture and the subscriber count for you.",
  },
  {
    icon: CameraIcon,
    title: "A screenshot or two from inside it",
    body: "Analytics or revenue, taken from the account itself. One is enough to start.",
  },
  {
    icon: TagIcon,
    title: "A price in mind",
    body: "You set it, buyers can make an offer, and you never have to accept one.",
  },
];

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

      <div className="mt-1">
        <PageHead
          title="List an account"
          description="Free to list, and about ten minutes if you have the link to hand. Nothing is shown to buyers until you have proved the account is yours and a moderator has checked it."
        />
      </div>

      <ul className="mt-6 grid gap-3 sm:grid-cols-3">
        {NEEDED.map((item) => (
          <li
            key={item.title}
            className="rounded-card border border-line bg-surface p-4"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary-text">
              <item.icon aria-hidden="true" className="size-[1.15rem]" />
            </span>
            <h2 className="mt-3 font-display text-sm font-bold text-fg">
              {item.title}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {item.body}
            </p>
          </li>
        ))}
      </ul>

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {[
          { icon: LockIcon, label: "Private until you send it" },
          { icon: ClockIcon, label: "Save a draft at any point" },
          { icon: BadgeCheckIcon, label: "Free to list, no exclusivity" },
        ].map((point) => (
          <li
            key={point.label}
            className="inline-flex items-center gap-2 text-xs text-subtle sm:text-sm"
          >
            <point.icon
              aria-hidden="true"
              className="size-4 shrink-0 text-verified"
            />
            {point.label}
          </li>
        ))}
      </ul>

      <div className="mt-7">
        <ListingForm platforms={choices} listingId={null} fees={fees} />
      </div>
    </>
  );
}
