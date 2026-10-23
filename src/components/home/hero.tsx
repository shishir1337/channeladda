import { HeroSearch } from "@/components/home/hero-search";
import { Container } from "@/components/ui/section";

type Stats = {
  transfers: number;
};

/**
 * The first screen: what this is, the one promise, and the search.
 *
 * No decoration standing in for hierarchy — the floating marks, the grid and
 * the glow are gone. The headline's second line is muted rather than gold,
 * so the only colour above the fold is the button that does something.
 */
export function Hero({ stats }: { stats: Stats }) {
  return (
    <section id="top" className="pt-14 pb-10 sm:pt-20 sm:pb-14 lg:pt-24">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[0.8125rem] text-muted shadow-xs">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-1.5 animate-pulse-dot rounded-full bg-verified" />
              <span className="relative inline-flex size-1.5 rounded-full bg-verified" />
            </span>
            <span className="font-medium text-fg">Live marketplace</span>
            <span aria-hidden="true" className="text-subtle">
              ·
            </span>
            new listings daily
          </p>

          <h1 className="mt-6 text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.035em] sm:text-[3.5rem]">
            Buy and sell social accounts{" "}
            <span className="text-muted">without the risk</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted sm:mt-6 sm:text-lg">
            Our agent holds your money or the account until the handover is
            done.{" "}
            <span className="tnum font-medium text-fg">
              {stats.transfers.toLocaleString("en-US")}
            </span>{" "}
            deals completed.
          </p>
        </div>

        <div className="mx-auto mt-9 max-w-4xl sm:mt-10">
          <HeroSearch />
        </div>
      </Container>
    </section>
  );
}
