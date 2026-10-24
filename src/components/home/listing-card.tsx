import { BadgeCheckIcon } from "lucide-react";
import Link from "next/link";
import { pointsLabel } from "@/components/app/reseller-badge";
import { FavoriteButton } from "@/components/home/favorite-button";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
import type { Listing } from "@/data/listings";
import { platformMap } from "@/data/platforms";
import { countOf } from "@/lib/plural";
import { revenueLine } from "@/lib/revenue-line";
import { cn, formatCompact } from "@/lib/utils";

/**
 * Tags in the one colour that means something for each: gold for what we
 * promote, blue for news. "Hot" and a price drop are facts, not alarms or
 * verifications, so they are neutral.
 */
const tagStyles = {
  featured: { label: "Featured", variant: "primary" as const },
  hot: { label: "Popular", variant: "neutral" as const },
  new: { label: "New", variant: "info" as const },
  ending: { label: "Price drop", variant: "neutral" as const },
};

/**
 * One listing in a grid.
 *
 * Cover, the account, one line on what it is, three facts, and the price —
 * the whole card is the link. It used to stack five boxes (a bordered metric
 * grid, a chip row and a price row with its own rule) and a "View" button
 * that did what the card already did.
 */
export function ListingCard({
  listing,
  priority,
  phoneRow = false,
  className,
}: {
  listing: Listing;
  /** Skip lazy-loading for cards above the fold. */
  priority?: boolean;
  /**
   * In a list down the page, a phone shows the listing as one compact row:
   * a full card there was a whole screen per listing, so somebody browsing
   * saw one or two at a time. Off in swipe rows, where cards sit side by side.
   */
  phoneRow?: boolean;
  className?: string;
}) {
  if (phoneRow) {
    return (
      <>
        <PhoneRow listing={listing} priority={priority} className="sm:hidden" />
        <ListingCard
          listing={listing}
          priority={priority}
          className={cn("max-sm:hidden", className)}
        />
      </>
    );
  }
  const platform = platformMap[listing.platform];
  const PlatformIcon = platform.icon;
  const tag = listing.tag ? tagStyles[listing.tag] : null;
  const revenue = revenueLine(listing);

  return (
    <article
      className={cn(
        "lift-card group relative flex h-full flex-col rounded-card border border-line bg-surface hover:border-line-strong",
        className,
      )}
    >
      <div className="relative">
        {/* Clipped on its own wrapper so the card keeps its hover shadow. */}
        <div className="overflow-hidden rounded-t-[calc(var(--radius-card)-1px)] bg-surface-2">
          {/* biome-ignore lint/performance/noImgElement: static SVG artwork —
              next/image cannot optimise vectors and would need the global
              dangerouslyAllowSVG flag, which is unsafe once sellers upload
              their own images. Dimensions are set, so there is no CLS. */}
          <img
            src={listing.coverUrl}
            alt=""
            width={480}
            height={240}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            className="aspect-[2/1] w-full object-cover"
          />
        </div>

        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          <span
            className="flex size-7 items-center justify-center rounded-md bg-black/55 backdrop-blur-sm"
            style={{ color: platform.tint }}
          >
            <PlatformIcon className="size-3.5" />
            <span className="sr-only">{platform.name}</span>
          </span>
          {tag ? (
            <Badge
              variant={tag.variant}
              className={cn(
                tag.variant === "neutral" &&
                  "border-transparent bg-black/55 text-white backdrop-blur-sm",
              )}
            >
              {tag.label}
            </Badge>
          ) : null}
        </div>

        <div className="absolute top-1.5 right-1.5">
          <FavoriteButton listingId={listing.id} handle={listing.handle} />
        </div>

        {/* The account's own picture, straddling the cover and the body. */}
        {/* biome-ignore lint/performance/noImgElement: static SVG avatar, see above. */}
        <img
          src={listing.avatarUrl}
          alt=""
          width={96}
          height={96}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="absolute -bottom-5 left-4 size-12 rounded-full border-[3px] border-surface bg-surface-2 object-cover"
        />
      </div>

      <div className="flex flex-1 flex-col px-4 pt-7 pb-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="min-w-0 truncate text-[0.9375rem] font-semibold text-fg">
            <Link
              href={`/listing/${listing.slug}`}
              className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary focus-visible:after:ring-offset-2 focus-visible:after:ring-offset-bg"
            >
              {listing.handle}
            </Link>
          </h3>
          {listing.ownershipVerified ? (
            <BadgeCheckIcon
              aria-label="Ownership verified"
              className="size-4 shrink-0 text-verified"
            />
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[0.8125rem] text-subtle">
          {platform.name} · {listing.niche}
        </p>

        {/* Two lines reserved, so the facts line up across a row. */}
        <p className="mt-2 line-clamp-2 min-h-[2.75rem] text-sm leading-relaxed text-muted">
          {listing.title}
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-3">
          <Fact
            label={platform.metricLabel}
            value={formatCompact(listing.audience)}
          />
          <Fact label="Engagement" value={`${listing.engagement}%`} />
          <Fact label="Age" value={`${listing.ageYears} yr`} />
        </dl>

        <p className="mt-3 flex items-center gap-1.5 truncate text-[0.8125rem] text-subtle">
          {revenue.kind === "revenue" ? (
            <span className="text-muted">
              <Price usd={revenue.usd} className="font-medium text-fg" /> a
              month
            </span>
          ) : revenue.kind === "monetized" ? (
            <span className="text-muted">Monetized</span>
          ) : (
            <span>Not monetized</span>
          )}
          <span aria-hidden="true">·</span>
          <span className="truncate">{listing.country}</span>
        </p>

        {/* Price over the seller line: side by side, a three-across grid
            cut the seller's name and sales down to "2 s…". */}
        <div className="mt-auto pt-4">
          <div className="flex items-baseline gap-2">
            <Price
              usd={listing.price}
              className="tnum text-xl font-semibold tracking-[-0.01em] text-fg"
            />
            {listing.wasPrice ? (
              <Price
                usd={listing.wasPrice}
                className="tnum text-[0.8125rem] text-subtle line-through"
              />
            ) : null}
          </div>
          <p className="mt-1 flex min-w-0 items-center gap-1 text-[0.8125rem] text-subtle">
            <span className="min-w-0 truncate">{listing.sellerName}</span>
            <span aria-hidden="true">·</span>
            <span className="tnum shrink-0 font-medium text-muted">
              {pointsLabel(listing.sellerPoints)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tnum shrink-0">
              {countOf(listing.sellerSales, "sale")}
            </span>
          </p>
        </div>
      </div>
    </article>
  );
}

/**
 * The listing as one row, for a phone: the account's picture, who it is,
 * the three numbers on one line, and the price. About a quarter of the
 * card's height, so four or five fit on a screen.
 */
function PhoneRow({
  listing,
  priority,
  className,
}: {
  listing: Listing;
  priority?: boolean;
  className?: string;
}) {
  const platform = platformMap[listing.platform];
  const PlatformIcon = platform.icon;
  const tag = listing.tag ? tagStyles[listing.tag] : null;
  const revenue = revenueLine(listing);

  return (
    <article
      className={cn(
        "group relative flex gap-3 rounded-card border border-line bg-surface p-3 transition-colors duration-150 active:bg-surface-2",
        className,
      )}
    >
      <div className="relative shrink-0 self-start">
        {/* biome-ignore lint/performance/noImgElement: static SVG avatar, as on the card. */}
        <img
          src={listing.avatarUrl}
          alt=""
          width={64}
          height={64}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="size-16 rounded-xl bg-surface-2 object-cover"
        />
        <span
          className="absolute -right-1.5 -bottom-1.5 flex size-6 items-center justify-center rounded-md border-2 border-surface bg-surface-2"
          style={{ color: platform.tint }}
        >
          <PlatformIcon className="size-3.5" />
          <span className="sr-only">{platform.name}</span>
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5 pr-10">
          <h3 className="min-w-0 truncate text-[0.9375rem] font-semibold text-fg">
            <Link
              href={`/listing/${listing.slug}`}
              className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary"
            >
              {listing.handle}
            </Link>
          </h3>
          {listing.ownershipVerified ? (
            <BadgeCheckIcon
              aria-label="Ownership verified"
              className="size-4 shrink-0 text-verified"
            />
          ) : null}
        </div>
        <p className="truncate pr-10 text-[0.8125rem] text-subtle">
          {listing.niche} · {listing.country}
        </p>
        <p className="tnum mt-1 truncate text-[0.8125rem] text-muted">
          <span className="font-medium text-fg">
            {formatCompact(listing.audience)}
          </span>{" "}
          {platform.metricLabel.toLowerCase()} · {listing.engagement}% ·{" "}
          {listing.ageYears} yr
        </p>
        <div className="mt-1.5 flex min-w-0 items-center gap-2">
          <Price
            usd={listing.price}
            className="tnum text-base font-semibold text-fg"
          />
          {revenue.kind === "revenue" ? (
            <span className="truncate text-xs text-muted">
              <Price usd={revenue.usd} compact /> a month
            </span>
          ) : null}
          {tag ? (
            <Badge variant={tag.variant} className="ml-auto shrink-0">
              {tag.label}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="absolute top-1 right-1">
        <FavoriteButton
          listingId={listing.id}
          handle={listing.handle}
          on="surface"
        />
      </div>
    </article>
  );
}

/** One fact about the account: a quiet label over its value. */
function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-subtle">{label}</dt>
      <dd className="tnum mt-0.5 truncate text-sm font-semibold text-fg">
        {value}
      </dd>
    </div>
  );
}
