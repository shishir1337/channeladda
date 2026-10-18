import {
  ArrowUpRightIcon,
  BadgeCheckIcon,
  CheckIcon,
  ShieldCheckIcon,
  StarIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChannelAddaLogo } from "@/components/icons/brand-icons";
import { getPlatformCounts } from "@/server/listings";
import { getSiteStats } from "@/server/sellers";

const trustPoints = [
  { icon: ShieldCheckIcon, label: "Agent-held deals" },
  { icon: BadgeCheckIcon, label: "Ownership checked" },
  { icon: StarIcon, label: "Reviews from real buyers" },
];

/**
 * How a Safest deal moves, drawn rather than described. Decorative: it is the
 * shape of the product, not anybody's deal.
 */
const glimpse = [
  { label: "Admin fee paid", state: "done" },
  { label: "Agent holds the channel", state: "done" },
  { label: "Price paid to Channel Adda", state: "now" },
  { label: "Ownership handed over", state: "next" },
] as const;

/**
 * Every auth screen: the form on the left, quiet and centred; on a wide
 * screen a dark panel that says what makes the place safe in a line and a
 * picture instead of three paragraphs.
 *
 * Rendered with `data-app`, so these pages share the dashboard's palette,
 * type and control sizes — signing in should feel like the first screen of
 * the tool, not the last page of the brochure.
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
    // leave both at zero; the figures below are skipped
  }

  return (
    <div
      data-app=""
      className="min-h-dvh bg-bg lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
    >
      <div className="flex min-h-dvh flex-col px-5 py-4 sm:px-8 sm:py-6">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex min-h-11 items-center gap-2 rounded-md"
            aria-label="Channel Adda home"
          >
            <ChannelAddaLogo className="size-7" />
            <span className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-fg">
              Channel Adda
            </span>
          </Link>
          <Link
            href="/browse"
            className="group inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-[0.8125rem] text-muted transition-colors hover:text-fg"
          >
            Back to marketplace
            <ArrowUpRightIcon
              aria-hidden="true"
              className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </Link>
        </header>

        <main
          id="main"
          className="mx-auto flex w-full max-w-[23rem] flex-1 animate-app-in flex-col justify-center py-12"
        >
          <h1 className="text-2xl leading-8 font-semibold tracking-[-0.022em] text-fg">
            {title}
          </h1>
          <div className="mt-1.5 text-sm leading-relaxed text-muted">
            {description}
          </div>

          <div className="mt-8">{children}</div>

          {footer ? (
            <div className="mt-8 text-center text-[0.8125rem] leading-relaxed text-muted">
              {footer}
            </div>
          ) : null}
        </main>

        <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-subtle lg:justify-start">
          <span>© Channel Adda</span>
          <Link href="/terms" className="transition-colors hover:text-fg">
            Terms
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-fg">
            Privacy
          </Link>
        </footer>
      </div>

      {/* The panel. Dark in both themes — it is the brand, not the page. */}
      <aside
        aria-label="Why people trade on Channel Adda"
        className="relative m-3 hidden flex-col justify-between overflow-hidden rounded-2xl bg-[#0d0d10] p-10 text-white ring-1 ring-black/5 lg:flex xl:p-14 dark:bg-[#111114] dark:ring-white/[0.07]"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 -right-32 size-[34rem] rounded-full bg-[radial-gradient(closest-side,rgb(255_176_32/0.22),transparent)]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-48 -left-40 size-[30rem] rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.06),transparent)]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgb(255_255_255/0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.035)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
        />

        <p className="relative inline-flex w-fit items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-white/70">
          <ShieldCheckIcon
            aria-hidden="true"
            className="size-3.5 text-primary"
          />
          The supervised marketplace
        </p>

        <div className="relative">
          <h2 className="max-w-[18ch] text-[2rem] leading-[1.15] font-semibold tracking-[-0.025em] text-white">
            We hold the money, and on Safest the account too.
          </h2>
          <p className="mt-3 max-w-[38ch] text-sm leading-relaxed text-white/55">
            Until the handover is confirmed, neither side has to trust a
            stranger.
          </p>

          <div
            aria-hidden="true"
            className="mt-10 max-w-sm rounded-xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.8)] backdrop-blur-sm"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-white/80">Safest deal</span>
              <span className="text-white/45 tabular-nums">Step 3 of 4</span>
            </div>
            <div
              aria-hidden="true"
              className="mt-3 h-1 overflow-hidden rounded-full bg-white/10"
            >
              <div className="h-full w-[62%] rounded-full bg-primary" />
            </div>
            <ol className="mt-4 flex flex-col gap-3">
              {glimpse.map((step) => (
                <li key={step.label} className="flex items-center gap-3">
                  {step.state === "done" ? (
                    <span className="inline-flex size-5 items-center justify-center rounded-full bg-white/10 text-white/80">
                      <CheckIcon
                        aria-hidden="true"
                        className="size-3"
                        strokeWidth={3}
                      />
                    </span>
                  ) : step.state === "now" ? (
                    <span className="inline-flex size-5 items-center justify-center rounded-full ring-2 ring-primary">
                      <span className="size-1.5 animate-pulse-dot rounded-full bg-primary" />
                    </span>
                  ) : (
                    <span className="size-5 rounded-full ring-1 ring-white/20" />
                  )}
                  <span
                    className={
                      step.state === "next"
                        ? "text-sm text-white/40"
                        : step.state === "now"
                          ? "text-sm font-medium text-white"
                          : "text-sm text-white/60"
                    }
                  >
                    {step.label}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="relative flex flex-col gap-6">
          <ul className="flex flex-wrap gap-2">
            {trustPoints.map((point) => (
              <li
                key={point.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70"
              >
                <point.icon
                  aria-hidden="true"
                  className="size-3.5 text-white/50"
                />
                {point.label}
              </li>
            ))}
          </ul>
          {liveListings > 0 ? (
            <dl className="flex gap-10 border-t border-white/10 pt-6">
              <div>
                <dt className="text-xs text-white/45">Live listings</dt>
                <dd className="mt-1 text-xl font-semibold text-white tabular-nums">
                  {liveListings.toLocaleString("en-US")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-white/45">Transfers completed</dt>
                <dd className="mt-1 text-xl font-semibold text-white tabular-nums">
                  {transfers.toLocaleString("en-US")}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
