import { Container, Section, SectionHeading } from "@/components/ui/section";
import { Stars } from "@/components/ui/stars";
import { db } from "@/lib/db";
import { platformReviews, shortName } from "@/server/reviews";

/**
 * What members say about Channel Adda, from the reviews they left in a deal's
 * chat once it completed.
 *
 * This used to render three hard-coded quotes — named people, five stars
 * each, one describing a dispute "settled in my favour within 48 hours" by a
 * dispute desk that did not exist yet — under a heading that said "Pulled
 * from verified orders." None of it was. Presenting invented reviews as real
 * is the one kind of marketing copy that is a legal problem rather than a
 * tone problem.
 *
 * Every review here stands on a completed deal its author was in, and the
 * whole section is absent until there are some.
 */
const SHOWN = 3;

async function recentReviews() {
  return db.platformReview.findMany({
    where: {
      // Praise that says something, on a deal that really finished.
      rating: { gte: 4 },
      NOT: { body: "" },
      order: { status: "COMPLETED" },
    },
    orderBy: { createdAt: "desc" },
    take: SHOWN,
    select: {
      id: true,
      rating: true,
      body: true,
      authorId: true,
      author: { select: { name: true } },
      order: {
        select: {
          mode: true,
          buyerId: true,
          listing: { select: { platform: true } },
        },
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

export async function Testimonials() {
  const [reviews, summary] = await Promise.all([
    recentReviews(),
    platformReviews({ take: 0 }),
  ]);
  if (reviews.length === 0) return null;

  return (
    <Section>
      <Container>
        <SectionHeading
          title="What members say"
          description={
            summary.average !== null
              ? `Rated ${summary.average.toFixed(1)} out of 5 by ${summary.count} ${summary.count === 1 ? "member" : "members"}, all from completed deals.`
              : "Only from deals that completed."
          }
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
                    {review.authorId === review.order.buyerId
                      ? "Bought"
                      : "Sold"}{" "}
                    a{" "}
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
