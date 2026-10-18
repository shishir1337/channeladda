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
        description="Free to list, and about ten minutes with the link to hand. Nothing is shown to buyers until you have proved the account is yours and a moderator has checked it."
      />

      <Card>
        <ul className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {NEEDED.map((item) => (
            <li key={item.title} className="flex gap-3 p-4 sm:p-5">
              <IconTile icon={item.icon} size="sm" />
              <div className="min-w-0">
                <h2 className="text-sm leading-7 font-semibold text-fg">
                  {item.title}
                </h2>
                <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
                  {item.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 px-1">
        {PROMISES.map((point) => (
          <li
            key={point.label}
            className="inline-flex items-center gap-1.5 text-[0.8125rem] text-muted"
          >
            <point.icon
              aria-hidden="true"
              className="size-3.5 shrink-0 text-verified"
            />
            {point.label}
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <ListingForm platforms={choices} listingId={null} fees={fees} />
      </div>
    </>
  );
}
