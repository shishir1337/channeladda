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
          title="Pick your platform, then filter it down"
          description="Five marketplaces under one roof. Every listing is checked for ownership before it reaches this page."
          action={
            <Link
              href="/browse"
              className="group inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-fg transition-colors duration-150 hover:text-muted"
            >
              Browse all {countOf(total, "listing")}
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
                className="group flex h-full flex-col items-start gap-4 rounded-card border border-line bg-surface p-4 transition-colors duration-150 hover:border-line-strong hover:bg-surface-2/60 sm:p-5"
              >
                <span
                  className="flex size-10 items-center justify-center rounded-lg border border-line bg-surface-2"
                  style={{ color: platform.tint }}
                >
                  <platform.icon className="size-5" />
                </span>
                <div>
                  <h3 className="text-[0.9375rem] font-semibold text-fg">
                    {platform.name}
                  </h3>
                  <p className="tnum mt-0.5 text-[0.8125rem] text-muted">
                    {countOf(counts[platform.id], "listing")}
                  </p>
                  {floors[platform.id] !== null ? (
                    <p className="mt-3 text-[0.8125rem] text-subtle">
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
