import { CheckCircle2Icon } from "lucide-react";
import Link from "next/link";
import { Price } from "@/components/ui/price";
import { type SoldItem, soldAgoLabel } from "@/data/listings";
import { platformMap } from "@/data/platforms";
import { formatCompact } from "@/lib/utils";

export function SoldTicker({ items }: { items: SoldItem[] }) {
  // Duplicated once so the -50% marquee keyframe loops seamlessly.
  const track = [...items, ...items];

  return (
    <section
      aria-labelledby="sold-heading"
      className="border-y border-line bg-surface py-5"
    >
      <h2 id="sold-heading" className="sr-only">
        Recently sold accounts
      </h2>

      <div className="mx-auto flex w-full max-w-[81rem] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/sold"
          className="hidden shrink-0 items-center gap-2 text-xs font-semibold tracking-[0.12em] text-verified uppercase transition-opacity hover:opacity-75 sm:flex"
        >
          <CheckCircle2Icon aria-hidden="true" className="size-4" />
          Recently sold
        </Link>

        {/* Wide fades on both ends so a half-scrolled pill reads as a fade
            rather than a clipped element next to the label. */}
        <div className="relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_12%,#000_88%,transparent)]">
          <ul className="flex w-max animate-marquee items-center gap-3 hover:[animation-play-state:paused]">
            {track.map((item, index) => {
              const platform = platformMap[item.platform];
              return (
                <li
                  // Track is an intentional duplicate, so index disambiguates.
                  key={`${item.id}-${index}`}
                  className="flex shrink-0 items-center gap-2.5 rounded-full border border-line bg-surface-2 py-2 pr-4 pl-2.5"
                >
                  <span
                    className="flex size-7 items-center justify-center rounded-full bg-surface"
                    style={{ color: platform.tint }}
                  >
                    <platform.icon className="size-3.5" />
                  </span>
                  <span className="text-[0.8125rem] font-medium">
                    {item.handle}
                  </span>
                  <span className="tnum text-xs text-subtle">
                    {formatCompact(item.audience)}
                  </span>
                  <span aria-hidden="true" className="h-3.5 w-px bg-line" />
                  <Price
                    usd={item.price}
                    className="text-[0.8125rem] font-semibold text-verified"
                  />
                  <span className="hidden text-xs text-subtle sm:inline">
                    {soldAgoLabel(item.soldHoursAgo)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
