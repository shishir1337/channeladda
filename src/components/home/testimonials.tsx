import { QuoteIcon, StarIcon } from "lucide-react";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { db } from "@/lib/db";

/** One name per star, so a rating row is keyed by name, not position. */
const STAR_KEYS = ["one", "two", "three", "four", "five"] as const;

/**
 * Reviews, from the reviews table.
 *
 * This used to render three hard-coded quotes — named people, five stars
 * each, one describing a dispute "settled in my favour within 48 hours" by a
 * dispute desk that did not exist yet — under a heading that said "Pulled
 * from verified orders." None of it was. Presenting invented reviews as real
 * is the one kind of marketing copy that is a legal problem rather than a
 * tone problem.
 *
 * Now it shows reviews people actually left on completed deals, and the whole
 * section is absent until there are some. An empty marketplace saying nothing
 * about reviews is honest; one quoting customers it does not have is not.
 */
const SHOWN = 3;

async function recentReviews() {
  return db.review.findMany({
    where: {
      // A review the person meant as praise, on a deal that really finished.
      rating: { gte: 4 },
      order: { status: "COMPLETED" },
    },
    orderBy: { createdAt: "desc" },
    take: SHOWN,
    select: {
      id: true,
      rating: true,
      body: true,
      author: { select: { name: true } },
      order: {
        select: { mode: true, listing: { select: { platform: true } } },
      },
    },
  });
}

const PLATFORM_NAMES: Record<string, string> = {
  YOUTUBE: "YouTube",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  TELEGRAM: "Telegram",
  WEBSITE: "website",
};

/** "Hannah W." — a reviewer's surname is not ours to publish. */
function shortName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]}.` : first;
}

export async function Testimonials() {
  const reviews = await recentReviews();
  if (reviews.length === 0) return null;

  return (
    <Section>
      <Container>
        <SectionHeading
          eyebrow="Reviews"
          title="What closing a deal here actually feels like"
          description="Left by buyers on deals that completed. Nobody can review a deal they were not part of."
          align="center"
        />

        <ul className="mt-10 grid gap-4 sm:mt-14 lg:grid-cols-3 lg:gap-5">
          {reviews.map((review) => (
            <li key={review.id}>
              <figure className="lift-card flex h-full flex-col rounded-card border border-line bg-surface p-6 hover:border-primary/40 sm:p-7">
                <QuoteIcon
                  aria-hidden="true"
                  className="size-7 text-primary/35"
                  fill="currentColor"
                />
                <blockquote className="mt-4 flex-1 text-[0.9375rem] leading-relaxed text-fg">
                  {review.body}
                </blockquote>

                <div
                  role="img"
                  className="mt-6 flex items-center gap-0.5"
                  aria-label={`Rated ${review.rating} out of 5`}
                >
                  {STAR_KEYS.slice(0, review.rating).map((star) => (
                    <StarIcon
                      key={star}
                      aria-hidden="true"
                      className="size-4 fill-primary text-primary"
                    />
                  ))}
                </div>

                <figcaption className="mt-4 border-t border-line pt-5">
                  <span className="block truncate text-sm font-semibold">
                    {shortName(review.author.name)}
                  </span>
                  <span className="mt-0.5 block text-xs text-subtle">
                    Bought a{" "}
                    {PLATFORM_NAMES[review.order.listing.platform] ?? "channel"}{" "}
                    account ·{" "}
                    {review.order.mode === "SAFEST" ? "Safest" : "Fastest"} deal
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
