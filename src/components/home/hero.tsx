import { CheckCircle2Icon } from "lucide-react";
import { HeroSearch } from "@/components/home/hero-search";
import { CryptomusIcon } from "@/components/icons/brand-icons";
import { Price } from "@/components/ui/price";
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
  settledUsd: number;
  transfers: number;
  verifiedSellers: number;
};

export function Hero({ stats }: { stats: Stats }) {
  const siteStats: { value?: string; usd?: number; label: string }[] = [
    { usd: stats.settledUsd, label: "Settled through escrow" },
    {
      value: stats.transfers.toLocaleString("en-US"),
      label: "Accounts transferred",
    },
    {
      value: stats.verifiedSellers.toLocaleString("en-US"),
      label: "KYC-verified sellers",
    },
    { value: "4h 12m", label: "Median handover time" },
  ];

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
            Escrow holds every payment until you confirm the account is fully in
            your hands.{" "}
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

        <ul className="mx-auto mt-9 flex max-w-3xl flex-wrap items-center justify-center gap-x-5 gap-y-2.5 sm:mt-10">
          {[
            "No payment leaves escrow early",
            "KYC-verified sellers only",
            "Full refund if a transfer fails",
          ].map((point) => (
            <li
              key={point}
              className="inline-flex items-center gap-2 text-[0.8125rem] text-muted sm:text-sm"
            >
              <CheckCircle2Icon
                aria-hidden="true"
                className="size-4 shrink-0 text-verified"
              />
              {point}
            </li>
          ))}
        </ul>

        <div className="mt-12 rounded-panel border border-line bg-surface/60 p-6 backdrop-blur-sm sm:mt-16 sm:p-8">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-6 lg:grid-cols-4">
            {siteStats.map((stat) => (
              <div key={stat.label} className="text-center lg:text-left">
                <dt className="sr-only">{stat.label}</dt>
                <dd>
                  {/* Sans, not mono: at display sizes mono's wide word-space
                      pulls values like "4h 12m" apart. */}
                  <span className="tnum block font-sans text-2xl font-semibold text-fg sm:text-3xl lg:text-[2rem]">
                    {stat.usd !== undefined ? (
                      <Price usd={stat.usd} compact className="font-sans" />
                    ) : (
                      stat.value
                    )}
                  </span>
                  <span className="mt-1.5 block text-xs text-muted sm:text-sm">
                    {stat.label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-t border-line pt-6 text-xs text-subtle lg:justify-start">
            <CryptomusIcon aria-hidden="true" className="size-5 text-muted" />
            <span>
              Payments and payouts processed in crypto by{" "}
              <span className="font-medium text-muted">Cryptomus</span> — USDT,
              BTC, ETH, TRX and 20+ assets
            </span>
          </div>
        </div>
      </Container>
    </section>
  );
}
