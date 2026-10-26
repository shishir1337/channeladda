import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { Price } from "@/components/ui/price";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { type PlatformId, platforms } from "@/data/platforms";
import { countOf } from "@/lib/plural";

export function Categories({
  counts,
  floors,
}: {
  counts: Record<PlatformId, number>;
  /** The cheapest live listing per platform; null where none is on sale. */
  floors: Record<PlatformId, number | null>;
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <Section>
      <Container>
        <SectionHeading
          title="Browse by platform"
          action={
            <Link
              href="/browse"
              className="group inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-fg transition-colors duration-150 hover:text-muted"
            >
              {/* "Browse all 0 listings" before the first one. */}
              {total > 0
                ? `Browse all ${countOf(total, "listing")}`
                : "Browse all accounts"}
              <ArrowRightIcon
                aria-hidden="true"
                className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
              />
            </Link>
          }
        />

        <ul className="mt-8 grid grid-cols-2 gap-3 sm:mt-10 sm:grid-cols-3 lg:grid-cols-5">
          {platforms.map((platform) => (
            <li key={platform.id}>
              <Link
                href={`/browse/${platform.id}`}
                // Compact on a phone: the icon beside the name, not above it.
                className="group flex h-full items-center gap-3 rounded-card border border-line bg-surface p-3 transition-colors duration-150 hover:border-line-strong hover:bg-surface-2/60 sm:flex-col sm:items-start sm:gap-4 sm:p-5"
              >
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 sm:size-10"
                  style={{ color: platform.tint }}
                >
                  <platform.icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[0.9375rem] font-semibold text-fg">
                    {platform.name}
                  </h3>
                  <p className="tnum mt-0.5 text-[0.8125rem] text-muted">
                    {countOf(counts[platform.id], "listing")}
                  </p>
                  {floors[platform.id] !== null ? (
                    <p className="mt-3 hidden text-[0.8125rem] text-subtle sm:block">
                      from{" "}
                      <Price
                        usd={floors[platform.id] ?? 0}
                        className="font-medium text-fg"
                      />
                    </p>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
