import {
  BadgeCheckIcon,
  CircleDollarSignIcon,
  EyeIcon,
  MapPinIcon,
  StarIcon,
} from "lucide-react";
import Link from "next/link";
import { FavoriteButton } from "@/components/home/favorite-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import type { Listing } from "@/data/listings";
import { platformMap } from "@/data/platforms";
import { cn, formatCompact } from "@/lib/utils";

const tagStyles = {
  featured: { label: "Featured", variant: "primary" as const },
  hot: { label: "Hot", variant: "danger" as const },
  new: { label: "New", variant: "info" as const },
  ending: { label: "Price drop", variant: "verified" as const },
};

export function ListingCard({
  listing,
  priority,
  className,
}: {
  listing: Listing;
  /** Skip lazy-loading for cards above the fold. */
  priority?: boolean;
  className?: string;
}) {
  const platform = platformMap[listing.platform];
  const PlatformIcon = platform.icon;
  const tag = listing.tag ? tagStyles[listing.tag] : null;

  return (
    <article
      className={cn(
        // @container: the metric strip keys off the card width, not the viewport,
        // so a narrow card next to the browse filter rail still reads correctly.
        "lift-card group @container flex h-full flex-col rounded-card border border-line bg-surface hover:border-primary/45",
        className,
      )}
    >
      {/* Cover art. Its own wrapper handles the rounding + clipping so the
          card itself can keep its hover shadow. */}
      <div className="relative">
        <div className="relative overflow-hidden rounded-t-[calc(1rem-1px)]">
          {/* biome-ignore lint/performance/noImgElement: static SVG artwork —
              next/image cannot optimise vectors and would need the global
              dangerouslyAllowSVG flag, which is unsafe once sellers upload
              their own images. Dimensions are set, so there is no CLS. */}
          <img
            src={listing.coverUrl}
            alt=""
            width={480}
            height={210}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            className="aspect-[16/7] w-full object-cover transition-transform duration-500 ease-[var(--ease-out-soft)] group-hover:scale-[1.04]"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-surface via-surface/10 to-transparent"
          />
        </div>

        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span
            className="flex size-8 items-center justify-center rounded-lg bg-black/55 backdrop-blur-sm"
            style={{ color: platform.tint }}
          >
            <PlatformIcon className="size-4" />
            <span className="sr-only">{platform.name}</span>
          </span>
          {tag ? <Badge variant={tag.variant}>{tag.label}</Badge> : null}
        </div>

        <div className="absolute top-1.5 right-1.5">
          <FavoriteButton listingId={listing.id} handle={listing.handle} />
        </div>

        {/* Channel avatar straddling the cover and the body. */}
        {/* biome-ignore lint/performance/noImgElement: static SVG avatar, see above. */}
        <img
          src={listing.avatarUrl}
          alt=""
          width={128}
          height={128}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="absolute -bottom-5 left-4 size-14 rounded-full border-[3px] border-surface bg-surface-2 object-cover sm:left-5"
        />
      </div>

      <div className="px-4 pt-7 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="truncate font-display text-[0.9375rem] font-semibold sm:text-base">
            {listing.handle}
          </h3>
          {listing.ownershipVerified ? (
            <BadgeCheckIcon
              aria-label="Ownership verified"
              className="size-4 shrink-0 text-verified"
            />
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-subtle">
          {platform.name} · {listing.niche}
        </p>

        {/* Two-line reservation keeps metric strips aligned across a row. */}
        <p className="mt-2.5 line-clamp-2 min-h-[2.6rem] text-[0.8125rem] leading-relaxed text-muted sm:min-h-[2.75rem] sm:text-sm">
          {listing.title}
        </p>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden border-y border-line bg-line @sm:grid-cols-4">
        <Metric
          label={platform.metricLabel}
          value={formatCompact(listing.audience)}
        />
        <Metric label="Engagement" value={`${listing.engagement}%`} />
        <Metric label="Age" value={`${listing.ageYears} yr`} />
        <Metric
          label="Revenue"
          value={
            listing.monthlyRevenue > 0 ? (
              <Price usd={listing.monthlyRevenue} />
            ) : (
              "—"
            )
          }
          highlight={listing.monthlyRevenue > 0}
        />
      </dl>

      <div className="flex flex-wrap items-center gap-1.5 px-4 py-3.5 sm:px-5">
        <Badge variant={listing.monetized ? "verified" : "neutral"}>
          <CircleDollarSignIcon aria-hidden="true" />
          {listing.monetized ? "Monetized" : "Not monetized"}
        </Badge>
        <Badge>
          <MapPinIcon aria-hidden="true" />
          {listing.country}
        </Badge>
        <Badge className="ml-auto text-subtle">
          <EyeIcon aria-hidden="true" />
          <span className="tnum">{listing.watching}</span> watching
        </Badge>
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-line px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <Price
              usd={listing.price}
              className="text-xl font-semibold text-fg sm:text-[1.375rem]"
            />
            {listing.wasPrice ? (
              <Price
                usd={listing.wasPrice}
                className="text-xs text-subtle line-through"
              />
            ) : null}
          </div>
          <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-subtle">
            <StarIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 fill-primary text-primary"
            />
            <span className="tnum text-muted">
              {listing.sellerRating.toFixed(1)}
            </span>
            <span className="truncate">
              · {listing.sellerName} · {listing.sellerSales} sales
            </span>
          </p>
        </div>

        <Button asChild variant="secondary" size="sm" className="shrink-0">
          {/* Card-wide click target: the overlay makes the whole card activate
              this link, while keeping a single accessible name. */}
          <Link href={`/listing/${listing.slug}`}>
            View
            <span className="sr-only"> details for {listing.handle}</span>
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-card"
            />
          </Link>
        </Button>
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="min-w-0 bg-surface px-4 py-3 @sm:px-2.5">
      {/* Single-line labels only — a wrapping label would push this cell's
          value out of line with its neighbours. Sentence case rather than
          uppercase: the cells are too narrow for full uppercase words. */}
      <dt className="truncate text-[0.6875rem] text-subtle">{label}</dt>
      <dd
        className={cn(
          "tnum mt-1 truncate text-sm font-semibold",
          highlight ? "text-verified" : "text-fg",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
