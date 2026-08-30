import {
  ArrowRightIcon,
  BadgeCheckIcon,
  StarIcon,
  TimerIcon,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { platformMap } from "@/data/platforms";
import { type Seller, sellerAvatarSrc } from "@/data/sellers";

export function TopSellers({ sellers }: { sellers: Seller[] }) {
  return (
    <Section>
      <Container>
        <SectionHeading
          eyebrow="Verified sellers"
          title="The people behind the listings"
          description="Ratings come only from completed, escrow-settled orders — there is no way to buy a review here."
          action={
            <Link
              href="/sellers"
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary-text transition-colors hover:text-fg"
            >
              See all verified sellers
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          }
        />

        <ul className="mt-9 grid gap-4 sm:mt-12 sm:grid-cols-2 xl:grid-cols-4">
          {sellers.map((seller) => (
            <li key={seller.slug}>
              <article className="lift-card group relative flex h-full flex-col rounded-card border border-line bg-surface p-5 hover:border-primary/45 sm:p-6">
                <div className="flex items-center gap-3">
                  {/* biome-ignore lint/performance/noImgElement: static SVG
                      profile picture; dimensions set, so no layout shift. */}
                  <img
                    src={sellerAvatarSrc(seller.slug)}
                    alt=""
                    width={160}
                    height={160}
                    loading="lazy"
                    decoding="async"
                    className="size-13 shrink-0 rounded-full border-2 border-line object-cover"
                  />
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-1.5 font-display text-base font-semibold">
                      <Link
                        href={`/seller/${seller.slug}`}
                        className="truncate"
                      >
                        {seller.name}
                        <span
                          aria-hidden="true"
                          className="absolute inset-0 rounded-card"
                        />
                      </Link>
                      <BadgeCheckIcon
                        aria-label="Verified seller"
                        className="size-4 shrink-0 text-verified"
                      />
                    </h3>
                    <p className="truncate text-xs text-subtle">
                      {seller.country} · Member since {seller.memberSince}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-2">
                  <span
                    className="flex items-center gap-0.5"
                    aria-hidden="true"
                  >
                    {Array.from({ length: 5 }, (_, i) => (
                      <StarIcon
                        // Fixed-length rating row; index is the only identity.
                        key={`${seller.slug}-star-${i}`}
                        className="size-3.5 fill-primary text-primary"
                      />
                    ))}
                  </span>
                  <span className="tnum text-sm font-semibold">
                    {seller.rating.toFixed(1)}
                  </span>
                  <span className="tnum text-xs text-subtle">
                    ({seller.reviews} reviews)
                  </span>
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5">
                  <div>
                    <dt className="text-[0.6875rem] text-subtle">
                      Completed sales
                    </dt>
                    <dd className="tnum mt-1 text-sm font-semibold">
                      {seller.sales}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[0.6875rem] text-subtle">
                      Settled volume
                    </dt>
                    <dd className="mt-1 text-sm font-semibold">
                      <Price usd={seller.volume} compact />
                    </dd>
                  </div>
                </dl>

                <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
                  <TimerIcon
                    aria-hidden="true"
                    className="size-3.5 text-verified"
                  />
                  Replies in{" "}
                  <span className="tnum font-medium text-fg">
                    ~{seller.responseMins} min
                  </span>
                </p>

                <div className="mt-auto flex flex-wrap gap-1.5 pt-5">
                  {seller.specialties.map((id) => {
                    const platform = platformMap[id];
                    return (
                      <Badge key={id}>
                        <platform.icon style={{ color: platform.tint }} />
                        {platform.name}
                      </Badge>
                    );
                  })}
                </div>
              </article>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
