import { Container, Section, SectionHeading } from "@/components/ui/section";
import { Stars } from "@/components/ui/stars";
import { db } from "@/lib/db";

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
          title="What buyers say"
          description="Only from deals that completed."
          align="center"
        />

        <ul className="mt-8 grid gap-3 sm:mt-10 lg:grid-cols-3">
          {reviews.map((review) => (
            <li key={review.id}>
              <figure className="flex h-full flex-col rounded-card border border-line bg-surface p-6">
                <div role="img" aria-label={`Rated ${review.rating} out of 5`}>
                  <Stars rating={review.rating} />
                </div>
                <blockquote className="mt-4 flex-1 text-[0.9375rem] leading-relaxed text-fg">
                  {review.body}
                </blockquote>

                <figcaption className="mt-5 border-t border-line pt-4">
                  <span className="block truncate text-sm font-semibold">
                    {shortName(review.author.name)}
                  </span>
                  <span className="mt-0.5 block text-[0.8125rem] text-subtle">
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
