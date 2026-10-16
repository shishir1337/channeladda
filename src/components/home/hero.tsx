import { HeroSearch } from "@/components/home/hero-search";
import { Container } from "@/components/ui/section";
import { platforms } from "@/data/platforms";

/** Decorative platform marks scattered behind the hero on wide screens. */
const floatingMarks = [
  { id: "youtube", className: "top-[18%] left-[4%] size-14 rotate-[-8deg]" },
  { id: "instagram", className: "top-[62%] left-[8%] size-11 rotate-[10deg]" },
  { id: "facebook", className: "top-[30%] right-[5%] size-12 rotate-[7deg]" },
  { id: "telegram", className: "top-[70%] right-[9%] size-10 rotate-[-12deg]" },
] as const;

type Stats = {
  transfers: number;
};

export function Hero({ stats }: { stats: Stats }) {
  return (
    <section
      id="top"
      className="relative overflow-hidden pt-12 pb-14 sm:pt-16 sm:pb-20 lg:pt-24"
    >
      {/* Backdrop layers, all decorative. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="grid-backdrop absolute inset-0 opacity-[0.5] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,#000_10%,transparent_75%)] dark:opacity-[0.35]" />
        <div className="absolute -top-40 left-1/2 h-[34rem] w-[64rem] -translate-x-1/2 rounded-full bg-primary/12 blur-[120px] dark:bg-primary/15" />
        <div className="absolute top-40 right-[12%] hidden h-72 w-72 rounded-full bg-verified/10 blur-[100px] lg:block" />
        {floatingMarks.map((mark) => {
          const platform = platforms.find((p) => p.id === mark.id);
          if (!platform) return null;
          return (
            <div
              key={mark.id}
              className={`absolute hidden items-center justify-center rounded-2xl border border-line bg-surface/70 shadow-soft backdrop-blur-sm xl:flex ${mark.className}`}
            >
              <platform.icon
                className="size-1/2 opacity-70"
                style={{ color: platform.tint }}
              />
            </div>
          );
        })}
      </div>

      <Container className="relative">
        <div className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted shadow-soft sm:text-[0.8125rem]">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-2 animate-pulse-dot rounded-full bg-verified" />
              <span className="relative inline-flex size-2 rounded-full bg-verified" />
            </span>
            <span className="text-fg">Live marketplace</span> — new listings
            daily
          </p>

          <h1 className="mt-6 text-[2.25rem] leading-[1.08] font-bold sm:text-6xl lg:text-[4.25rem]">
            Buy and sell social accounts{" "}
            <span className="relative whitespace-nowrap text-primary-text">
              without the risk
              <svg
                aria-hidden="true"
                viewBox="0 0 320 12"
                preserveAspectRatio="none"
                className="absolute -bottom-1 left-0 h-2.5 w-full text-primary/45 sm:-bottom-2 sm:h-3"
              >
                <path
                  d="M2 8.5C60 3.5 140 2 318 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted sm:mt-7 sm:text-lg">
            Every deal is held open by us — the account sits with one of our
            agents, or your payment does, until the handover is confirmed.{" "}
            <span className="tnum">
              {stats.transfers.toLocaleString("en-US")}
            </span>{" "}
            completed transfers across YouTube, Instagram, Facebook, Telegram
            and content websites.
          </p>
        </div>

        <div className="mx-auto mt-9 max-w-5xl sm:mt-10">
          <HeroSearch />
        </div>
      </Container>
    </section>
  );
}
