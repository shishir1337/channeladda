import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { Price } from "@/components/ui/price";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { type PlatformId, platforms } from "@/data/platforms";

export function Categories({ counts }: { counts: Record<PlatformId, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <Section className="border-y border-line bg-bg-subtle">
      <Container>
        <SectionHeading
          eyebrow="Shop by platform"
          title="Pick your platform, then filter it down"
          description="Five marketplaces under one roof. Every listing is checked for ownership before it reaches this page."
          action={
            <Link
              href="/browse"
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary-text transition-colors hover:text-fg"
            >
              Browse all {total.toLocaleString("en-US")} listings
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          }
        />

        <ul className="mt-9 grid grid-cols-2 gap-3 sm:mt-12 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          {platforms.map((platform) => (
            <li key={platform.id}>
              <Link
                href={`/browse/${platform.id}`}
                className="lift-card group flex h-full flex-col items-start gap-3 rounded-card border border-line bg-surface p-4 sm:p-6"
                style={{ ["--tint" as string]: platform.tint }}
              >
                {/* Brand-tinted wash, clipped to the card's own radius. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 overflow-hidden rounded-card"
                >
                  <span className="absolute inset-0 bg-[var(--tint)] opacity-0 transition-opacity duration-300 group-hover:opacity-[0.07] group-focus-visible:opacity-[0.07]" />
                  <span className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-[var(--tint)] transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:scale-x-100" />
                </span>

                <span
                  className="relative flex size-12 items-center justify-center rounded-xl border border-line bg-surface-2 transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:scale-105"
                  style={{ color: platform.tint }}
                >
                  <platform.icon className="size-6" />
                </span>
                <div className="relative">
                  <h3 className="font-display text-base font-semibold sm:text-lg">
                    {platform.name}
                  </h3>
                  <p className="tnum mt-1 text-xs text-muted sm:text-sm">
                    {counts[platform.id].toLocaleString("en-US")} listings
                  </p>
                  <p className="mt-2.5 text-xs text-subtle">
                    from{" "}
                    <Price
                      usd={platform.startingPrice}
                      className="font-medium text-primary-text"
                    />
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
