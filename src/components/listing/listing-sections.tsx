import {
  BadgeCheckIcon,
  CalendarIcon,
  CircleDollarSignIcon,
  GlobeIcon,
  ImageIcon,
  MapPinIcon,
  StarIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { pointsLabel, ResellerBadge } from "@/components/app/reseller-badge";
import { TrackRecordStats } from "@/components/deals/track-record";
import { SellerAvatar } from "@/components/site/seller-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { iconText } from "@/components/ui/icon-hue";
import { Price } from "@/components/ui/price";
import type { Listing } from "@/data/listings";
import type { Platform } from "@/data/platforms";
import type { Seller } from "@/data/sellers";
import { countOf } from "@/lib/plural";
import { formatCompact } from "@/lib/utils";

export function Panel({
  title,
  icon,
  children,
  id,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-card border border-line bg-surface p-4 sm:p-6"
    >
      <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
        {icon}
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function MetricsPanel({
  listing,
  platform,
}: {
  listing: Listing;
  platform: Platform;
}) {
  const rows = [
    {
      icon: UsersIcon,
      label: platform.metricLabel,
      value: formatCompact(listing.audience),
    },
    {
      icon: TrendingUpIcon,
      label: "Engagement rate",
      value: `${listing.engagement}%`,
    },
    {
      icon: CalendarIcon,
      label: "Account age",
      value: `${listing.ageYears} years`,
    },
    { icon: MapPinIcon, label: "Main audience", value: listing.country },
    { icon: GlobeIcon, label: "Niche", value: listing.niche },
    {
      icon: CircleDollarSignIcon,
      label: "Monthly revenue",
      value:
        listing.monthlyRevenue > 0 ? (
          <Price usd={listing.monthlyRevenue} />
        ) : (
          "Not monetized"
        ),
    },
  ];

  return (
    <Panel title="The numbers">
      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center gap-3 bg-surface px-4 py-3.5"
          >
            <row.icon
              aria-hidden="true"
              className={`size-4 shrink-0 ${iconText(row.icon)}`}
            />
            <dt className="text-sm text-muted">{row.label}</dt>
            <dd className="tnum ml-auto text-sm font-semibold text-fg">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/** The single most common source of post-sale disputes, stated up front. */
export function MonetizationNotice({ listing }: { listing: Listing }) {
  if (listing.monthlyRevenue <= 0) return null;

  return (
    <div className="flex gap-3 rounded-card border border-primary/30 bg-primary-soft/70 p-4 sm:p-6">
      <TriangleAlertIcon
        aria-hidden="true"
        className="mt-0.5 size-4.5 shrink-0 text-primary-text"
      />
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-fg">
          Revenue does not move with the channel
        </h2>
        {/* Two sentences where there were two paragraphs: it is a warning,
            read on a phone, and has one thing to say. */}
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          The{" "}
          <Price
            usd={listing.monthlyRevenue}
            className="font-semibold text-fg"
          />{" "}
          a month goes to the seller&apos;s own ad account. After the handover
          you connect your own and apply again.
        </p>
      </div>
    </div>
  );
}

export function TransferPanel({ platform }: { platform: Platform }) {
  return (
    <Panel title={`How the ${platform.name} handover works`} id="transfer">
      <ol className="flex flex-col gap-3">
        {platform.transferSteps.map((step, i) => (
          <li key={step} className="flex gap-3.5">
            <span className="tnum flex size-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-xs font-semibold text-muted">
              {i + 1}
            </span>
            <span className="pt-0.5 text-sm leading-relaxed text-fg">
              {step}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-5 rounded-xl border border-line bg-bg-subtle p-4 text-[0.8125rem] leading-relaxed text-muted">
        On Fastest you are an owner for{" "}
        <span className="font-semibold text-fg">{platform.holdDays} days</span>,
        then made primary owner.{" "}
        <Link
          href="/how-it-works"
          className="font-medium text-fg underline underline-offset-4 decoration-line-strong hover:decoration-fg"
        >
          See the full process
        </Link>
        .
      </p>
    </Panel>
  );
}

export function ProofPanel({ count }: { count: number }) {
  return (
    <Panel title="Seller proof" id="proof">
      {count ? (
        <>
          <p className="flex items-center gap-2.5 rounded-lg border border-line bg-bg-subtle px-3 py-2.5 text-sm">
            <ImageIcon
              aria-hidden="true"
              className={`size-4 shrink-0 ${iconText(ImageIcon)}`}
            />
            <span className="font-medium text-fg">
              {countOf(count, "screenshot")}
            </span>
            <span className="text-subtle">from inside the account</span>
          </p>
          {/* Not "checked by a moderator": a YouTube channel whose ownership
              code is found goes live with no moderator in between. */}
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Private to our team. Ask the seller for anything you want to see.
          </p>
        </>
      ) : (
        <p className="text-sm leading-relaxed text-muted">
          The seller has not uploaded proof screenshots for this listing. Ask
          them for analytics before you start a deal.
        </p>
      )}
    </Panel>
  );
}

export function SellerPanel({ seller }: { seller: Seller }) {
  return (
    <Panel title="About the seller">
      <div className="flex items-center gap-4">
        <SellerAvatar initials={seller.initials} image={seller.image} />
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-[0.9375rem] font-semibold">
            <span className="truncate">{seller.name}</span>
            <BadgeCheckIcon
              aria-label="Verified seller"
              className="size-4 shrink-0 text-verified"
            />
            {seller.reseller ? <ResellerBadge /> : null}
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[0.8125rem] text-subtle">
            <span className="tnum font-medium text-fg">
              {pointsLabel(seller.points ?? 0)}
            </span>
            {seller.rating !== null && seller.reviews > 0 ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <StarIcon
                    aria-hidden="true"
                    className="size-3.5 fill-primary text-primary"
                  />
                  <span className="tnum font-medium text-fg">
                    {seller.rating.toFixed(1)}
                  </span>
                  <span>({countOf(seller.reviews, "review")})</span>
                </span>
              </>
            ) : null}
            <span aria-hidden="true">·</span>
            <span>{seller.country}</span>
            <span aria-hidden="true">·</span>
            <span>Member since {seller.memberSince}</span>
          </p>
        </div>
      </div>

      {seller.record ? (
        <TrackRecordStats
          record={seller.record}
          className="mt-5 border-t border-line pt-5"
        />
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2.5">
        <Button asChild variant="secondary" size="sm">
          <Link href={`/seller/${seller.slug}`}>View seller profile</Link>
        </Button>
        <Badge variant="verified" size="md">
          <BadgeCheckIcon aria-hidden="true" />
          KYC verified
        </Badge>
      </div>
    </Panel>
  );
}
