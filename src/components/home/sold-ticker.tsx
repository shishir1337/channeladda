import { CheckCircle2Icon } from "lucide-react";
import Link from "next/link";
import { Price } from "@/components/ui/price";
import { type SoldItem, soldAgoLabel } from "@/data/listings";
import { platformMap } from "@/data/platforms";
import { formatCompact } from "@/lib/utils";

export function SoldTicker({ items }: { items: SoldItem[] }) {
  // Two copies, so the -50% marquee keyframe loops without a gap. Each copy
  // is named, so a key never depends on position. The second is there for
  // the eye alone: hidden from screen readers, which read each sale once.
  const track = [0, 1].flatMap((copy) =>
    items.map((item) => ({ ...item, copy })),
  );

  return (
    <section
      aria-labelledby="sold-heading"
      className="border-y border-line py-4"
    >
      <h2 id="sold-heading" className="sr-only">
        Recently sold accounts
      </h2>

      <div className="mx-auto flex w-full max-w-[80rem] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/sold"
          className="hidden shrink-0 items-center gap-1.5 text-[0.8125rem] font-medium text-muted transition-colors duration-150 hover:text-fg sm:flex"
        >
          <CheckCircle2Icon
            aria-hidden="true"
            className="size-4 text-verified"
          />
          Recently sold
        </Link>

        {/* Wide fades on both ends so a half-scrolled pill reads as a fade
            rather than a clipped element next to the label. */}
        <div className="relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_12%,#000_88%,transparent)]">
          <ul className="flex w-max animate-marquee items-center gap-3 hover:[animation-play-state:paused]">
            {track.map((item) => {
              const platform = platformMap[item.platform];
              return (
                <li
                  key={`${item.id}-${item.copy}`}
                  aria-hidden={item.copy === 1 ? true : undefined}
                  inert={item.copy === 1 ? true : undefined}
                  className="flex shrink-0 items-center gap-2.5 rounded-full border border-line bg-surface py-1.5 pr-3.5 pl-2"
                >
                  <span
                    className="flex size-6 items-center justify-center rounded-full bg-surface-2"
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
                    className="text-[0.8125rem] font-semibold text-fg"
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
