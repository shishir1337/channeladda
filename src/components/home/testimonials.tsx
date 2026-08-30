import { QuoteIcon, StarIcon } from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { sellerAvatarSrc } from "@/data/sellers";
import { testimonials } from "@/data/site";

export function Testimonials() {
  return (
    <Section>
      <Container>
        <SectionHeading
          eyebrow="Reviews"
          title="What closing a deal here actually feels like"
          description="Pulled from verified orders. Every reviewer completed an escrow-settled transaction."
          align="center"
        />

        <ul className="mt-10 grid gap-4 sm:mt-14 lg:grid-cols-3 lg:gap-5">
          {testimonials.map((item) => (
            <li key={item.name}>
              <figure className="lift-card flex h-full flex-col rounded-card border border-line bg-surface p-6 hover:border-primary/40 sm:p-7">
                <QuoteIcon
                  aria-hidden="true"
                  className="size-7 text-primary/35"
                  fill="currentColor"
                />
                <blockquote className="mt-4 flex-1 text-[0.9375rem] leading-relaxed text-fg">
                  {item.quote}
                </blockquote>

                <div
                  role="img"
                  className="mt-6 flex items-center gap-0.5"
                  aria-label={`Rated ${item.rating} out of 5`}
                >
                  {Array.from({ length: item.rating }, (_, i) => (
                    <StarIcon
                      // Fixed-length rating row; index is the only identity.
                      key={`${item.name}-star-${i}`}
                      aria-hidden="true"
                      className="size-4 fill-primary text-primary"
                    />
                  ))}
                </div>

                <figcaption className="mt-4 flex items-center gap-3 border-t border-line pt-5">
                  {/* biome-ignore lint/performance/noImgElement: static SVG
                      profile picture; dimensions set, so no layout shift. */}
                  <img
                    src={sellerAvatarSrc(item.avatar)}
                    alt=""
                    width={160}
                    height={160}
                    loading="lazy"
                    decoding="async"
                    className="size-11 shrink-0 rounded-full border-2 border-line object-cover"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {item.name}
                    </span>
                    <span className="block truncate text-xs text-subtle">
                      {item.role}
                    </span>
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
