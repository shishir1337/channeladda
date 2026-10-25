import { ArrowRightIcon, BadgeCheckIcon } from "lucide-react";
import Link from "next/link";
import { pointsLabel, ResellerBadge } from "@/components/app/reseller-badge";
import { SellerAvatar } from "@/components/site/seller-avatar";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { platformMap } from "@/data/platforms";
import type { Seller } from "@/data/sellers";

export function TopSellers({ sellers }: { sellers: Seller[] }) {
  return (
    <Section>
      <Container>
        <SectionHeading
          title="Top sellers"
          description="Rated in points from completed deals."
          action={
            <Link
              href="/sellers"
              className="group inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-fg transition-colors duration-150 hover:text-muted"
            >
              See all verified sellers
              <ArrowRightIcon
                aria-hidden="true"
                className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
              />
            </Link>
          }
        />

        <ul className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-2 xl:grid-cols-4 [&>li]:min-w-0">
          {sellers.map((seller) => (
            <li key={seller.slug}>
              <article className="lift-card group relative flex h-full flex-col rounded-card border border-line bg-surface p-5 hover:border-line-strong">
                <div className="flex items-center gap-3">
                  <SellerAvatar
                    initials={seller.initials}
                    image={seller.image}
                  />
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-1.5 text-[0.9375rem] font-semibold">
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
                      {seller.verified ? (
                        <BadgeCheckIcon
                          role="img"
                          aria-label="Verified seller: ID checked by Channel Adda"
                          className="size-4 shrink-0 text-verified"
                        />
                      ) : null}
                      {seller.reseller ? <ResellerBadge /> : null}
                    </h3>
                    <p className="truncate text-[0.8125rem] text-subtle">
                      {seller.country} · Member since {seller.memberSince}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 text-[0.8125rem]">
                  <span className="tnum font-semibold text-fg">
                    {pointsLabel(seller.points ?? 0)}
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4">
                  <div>
                    <dt className="text-xs text-subtle">Completed sales</dt>
                    <dd className="tnum mt-0.5 text-sm font-semibold">
                      {seller.sales}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-subtle">Settled volume</dt>
                    <dd className="mt-0.5 text-sm font-semibold">
                      <Price usd={seller.volume} compact />
                    </dd>
                  </div>
                </dl>

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
