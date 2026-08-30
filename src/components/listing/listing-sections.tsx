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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import type { Listing } from "@/data/listings";
import type { Platform } from "@/data/platforms";
import { type Seller, sellerAvatarSrc } from "@/data/sellers";
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
      className="scroll-mt-24 rounded-card border border-line bg-surface p-5 sm:p-6"
    >
      <h2 className="flex items-center gap-2.5 font-display text-lg font-semibold">
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
    <Panel
      title="The numbers"
      icon={
        <TrendingUpIcon
          aria-hidden="true"
          className="size-5 text-primary-text"
        />
      }
    >
      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center gap-3 bg-surface px-4 py-3.5"
          >
            <row.icon
              aria-hidden="true"
              className="size-4 shrink-0 text-subtle"
            />
            <dt className="text-sm text-muted">{row.label}</dt>
            <dd className="tnum ml-auto text-sm font-semibold">{row.value}</dd>
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
    <div className="rounded-card border border-danger/30 bg-danger-soft p-5 sm:p-6">
      <h2 className="flex items-center gap-2.5 font-display text-base font-semibold text-danger sm:text-lg">
        <TriangleAlertIcon aria-hidden="true" className="size-5 shrink-0" />
        Revenue does not transfer with this account
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        The{" "}
        <Price usd={listing.monthlyRevenue} className="font-semibold text-fg" />{" "}
        per month shown above is paid to the current owner&apos;s own ad
        account, which is tied to their tax identity and cannot be sold. After
        the handover you will need to connect your own account and be approved
        again.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Buy this listing for the audience and the content library. Treat the
        revenue figure as evidence of what the audience earns, not as income
        that arrives on day one.
      </p>
    </div>
  );
}

export function TransferPanel({ platform }: { platform: Platform }) {
  return (
    <Panel
      title={`How this ${platform.name} handover works`}
      icon={
        <BadgeCheckIcon aria-hidden="true" className="size-5 text-verified" />
      }
      id="transfer"
    >
      <p className="text-sm leading-relaxed text-muted">
        {platform.transferNote}
      </p>
      <ol className="mt-5 flex flex-col gap-3">
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
      <p className="mt-5 rounded-xl border border-line bg-surface-2 p-4 text-xs leading-relaxed text-muted">
        Funds stay in escrow for{" "}
        <span className="font-semibold text-fg">{platform.holdDays} days</span>{" "}
        after you confirm every step above.{" "}
        <Link
          href="/how-it-works"
          className="text-primary-text underline-offset-4 hover:underline"
        >
          See the full process
        </Link>
        .
      </p>
    </Panel>
  );
}

export function ProofPanel({ platform }: { platform: Platform }) {
  const shots = [1, 2, 3].map((n) => `/media/proof/${platform.id}-${n}.svg`);
  const labels = [
    "Audience growth, last 12 months",
    "Reach and engagement breakdown",
    "Revenue and payouts history",
  ];

  return (
    <Panel
      title="Seller proof"
      icon={
        <ImageIcon aria-hidden="true" className="size-5 text-primary-text" />
      }
      id="proof"
    >
      <p className="text-sm leading-relaxed text-muted">
        Uploaded by the seller and checked by our moderation team before this
        listing went live. Full-resolution originals are shared with the buyer
        once an order opens.
      </p>
      <ul className="mt-5 grid gap-3 sm:grid-cols-3">
        {shots.map((src, i) => (
          <li key={src}>
            <figure className="overflow-hidden rounded-xl border border-line bg-surface-2">
              {/* biome-ignore lint/performance/noImgElement: static SVG mock —
                  next/image cannot optimise vectors. Dimensions set, no CLS. */}
              <img
                src={src}
                alt={labels[i]}
                width={640}
                height={400}
                loading="lazy"
                decoding="async"
                className="aspect-[8/5] w-full object-cover"
              />
              <figcaption className="border-t border-line px-3 py-2.5 text-xs text-subtle">
                {labels[i]}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function SellerPanel({ seller }: { seller: Seller }) {
  return (
    <Panel title="About the seller">
      <div className="flex items-center gap-4">
        {/* biome-ignore lint/performance/noImgElement: static SVG avatar. */}
        <img
          src={sellerAvatarSrc(seller.slug)}
          alt=""
          width={160}
          height={160}
          loading="lazy"
          decoding="async"
          className="size-14 shrink-0 rounded-full border-2 border-line"
        />
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 font-display text-base font-semibold">
            <span className="truncate">{seller.name}</span>
            <BadgeCheckIcon
              aria-label="Verified seller"
              className="size-4 shrink-0 text-verified"
            />
          </h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-subtle">
            <StarIcon
              aria-hidden="true"
              className="size-3.5 fill-primary text-primary"
            />
            <span className="tnum text-muted">{seller.rating.toFixed(1)}</span>
            <span>
              ({seller.reviews} reviews) · {seller.country}
            </span>
          </p>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
        <Stat label="Sales" value={String(seller.sales)} />
        <Stat label="Volume" value={<Price usd={seller.volume} compact />} />
        <Stat label="Replies in" value={`~${seller.responseMins} min`} />
        <Stat label="Member since" value={seller.memberSince} />
      </dl>

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

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[0.6875rem] tracking-wide text-subtle uppercase">
        {label}
      </dt>
      <dd className="tnum mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}
