import {
  ArrowLeftIcon,
  BadgeCheckIcon,
  LockIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChannelAddaLogo } from "@/components/icons/brand-icons";
import { getPlatformCounts } from "@/server/listings";
import { getSiteStats } from "@/server/sellers";

const trustPoints = [
  {
    icon: LockIcon,
    title: "Your money is never at risk",
    body: "Payments sit in escrow until you confirm you hold the account. If a transfer fails, you are refunded in full.",
  },
  {
    icon: BadgeCheckIcon,
    title: "Ownership checked before listing",
    body: "Sellers prove control with a live code check, not a screenshot. Every listing is reviewed by a human.",
  },
  {
    icon: UsersIcon,
    title: "Ratings that cannot be bought",
    body: "A review can only be written by a buyer whose escrow-settled deal completed.",
  },
];

/**
 * Split layout for every auth screen: the form on the left, and the reasons to
 * trust us on the right where a first-time visitor will actually read them.
 */
export async function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  // Decorative only. Signing in must not depend on the marketplace figures
  // being available, so a database blip degrades to hiding them.
  let liveListings = 0;
  let transfers = 0;
  try {
    const [stats, counts] = await Promise.all([
      getSiteStats(),
      getPlatformCounts(),
    ]);
    liveListings = Object.values(counts).reduce((a, b) => a + b, 0);
    transfers = stats.transfers;
  } catch {
    // leave both at zero; the block below is skipped
  }

  return (
    <div className="flex min-h-dvh flex-col lg:grid lg:grid-cols-2">
      <div className="flex flex-1 flex-col px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex min-h-11 items-center gap-2.5 rounded-lg"
            aria-label="Channel Adda home"
          >
            <ChannelAddaLogo className="size-8" />
            <span className="font-display text-lg font-bold tracking-tight">
              Channel <span className="text-primary-text">Adda</span>
            </span>
          </Link>
          <Link
            href="/browse"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-muted transition-colors hover:text-fg"
          >
            <ArrowLeftIcon aria-hidden="true" className="size-4" />
            Back to marketplace
          </Link>
        </div>

        <main
          id="main"
          className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10"
        >
          <h1 className="font-display text-[1.75rem] leading-tight font-bold sm:text-[2rem]">
            {title}
          </h1>
          <div className="mt-3 text-[0.9375rem] leading-relaxed text-muted">
            {description}
          </div>

          <div className="mt-8">{children}</div>

          {footer ? (
            <div className="mt-8 border-t border-line pt-6 text-sm text-muted">
              {footer}
            </div>
          ) : null}
        </main>
      </div>

      {/* Reassurance panel. Hidden on small screens where the form matters more. */}
      <aside className="hidden border-l border-line bg-bg-subtle lg:flex lg:flex-col lg:justify-center lg:px-12 xl:px-16">
        <p className="text-xs font-semibold tracking-[0.14em] text-primary-text uppercase">
          Why people trade here
        </p>
        <ul className="mt-8 flex flex-col gap-8">
          {trustPoints.map((point) => (
            <li key={point.title} className="flex gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-text">
                <point.icon aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h2 className="font-display text-base font-semibold">
                  {point.title}
                </h2>
                <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
                  {point.body}
                </p>
              </div>
            </li>
          ))}
        </ul>

        {liveListings > 0 ? (
          <dl className="mt-12 flex gap-10 border-t border-line pt-8">
            <div>
              <dt className="text-xs text-subtle">Live listings</dt>
              <dd className="tnum mt-1 font-display text-xl font-bold">
                {liveListings.toLocaleString("en-US")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Transfers completed</dt>
              <dd className="tnum mt-1 font-display text-xl font-bold">
                {transfers.toLocaleString("en-US")}
              </dd>
            </div>
          </dl>
        ) : null}
      </aside>
    </div>
  );
}
