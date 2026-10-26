import { ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FaqList } from "@/components/site/faq-list";
import { GuideText } from "@/components/site/guide-text";
import { JsonLd } from "@/components/site/json-ld";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Container, Section } from "@/components/ui/section";
import { guideMap, guides } from "@/data/guides";
import { guideLd, readingMinutes } from "@/lib/guide-text";
import { pageMetadata } from "@/lib/seo";
import { siteUrl } from "@/lib/site-url";

export function generateStaticParams() {
  return guides.map((guide) => ({ slug: guide.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps<"/guides/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const guide = guideMap[slug];
  if (!guide) return { title: "Guide not found" };
  return pageMetadata({
    title: guide.metaTitle,
    description: guide.description,
    path: `/guides/${guide.slug}`,
    type: "article",
  });
}

export default async function GuidePage({
  params,
}: PageProps<"/guides/[slug]">) {
  const { slug } = await params;
  const guide = guideMap[slug];
  if (!guide) notFound();

  const selling = /sell|worth|value|price/i.test(guide.keyword);
  const others = guides.filter((other) => other.slug !== guide.slug);

  return (
    <>
      <JsonLd data={guideLd(siteUrl(), guide)} />
      <PageHeader
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Guides", href: "/guides" },
          { label: guide.title },
        ]}
        title={guide.title}
        description={
          <span className="text-[0.9375rem] sm:text-base">
            Updated {guide.updated} · {readingMinutes(guide)} min read
          </span>
        }
      />

      <Section>
        <Container className="max-w-3xl">
          <div className="flex flex-col gap-5 text-[1.0625rem] leading-relaxed text-fg">
            {guide.intro.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>
                <GuideText text={paragraph} />
              </p>
            ))}
          </div>

          {guide.sections.map((section) => (
            <section key={section.heading} className="mt-12">
              <h2 className="text-[1.375rem] leading-[1.25] font-semibold tracking-[-0.02em] sm:text-2xl">
                {section.heading}
              </h2>
              <div className="mt-4 flex flex-col gap-4 text-[1.0625rem] leading-relaxed text-muted">
                {section.blocks.map((block) =>
                  block.kind === "p" ? (
                    <p key={block.text.slice(0, 40)}>
                      <GuideText text={block.text} />
                    </p>
                  ) : (
                    <List
                      key={block.items[0]}
                      items={block.items}
                      ordered={block.ordered}
                    />
                  ),
                )}
              </div>
            </section>
          ))}

          <section className="mt-14 border-t border-line pt-10">
            <h2 className="text-[1.375rem] leading-[1.25] font-semibold tracking-[-0.02em] sm:text-2xl">
              Common questions
            </h2>
            <FaqList
              className="mt-5"
              items={guide.faqs.map((faq) => ({
                question: faq.question,
                answer: <GuideText text={faq.answer} />,
              }))}
            />
          </section>

          <div className="mt-12 flex flex-col items-start gap-4 rounded-panel border border-line bg-surface p-6 sm:p-8">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">
              {selling ? "Ready to sell?" : "Ready to buy?"}
            </h2>
            <p className="text-sm leading-relaxed text-muted">
              Every deal on Channel Adda goes through our agent, who holds the
              money or the channel until the handover is done.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="md">
                <Link href={selling ? "/sell/youtube" : "/browse/youtube"}>
                  {selling
                    ? "Sell your YouTube channel"
                    : "See YouTube channels for sale"}
                  <ArrowRightIcon aria-hidden="true" className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="secondary" size="md">
                <Link href="/how-it-works">How a deal works</Link>
              </Button>
            </div>
          </div>

          <div className="mt-12 border-t border-line pt-8">
            <h2 className="text-lg font-semibold">Read next</h2>
            <ul className="mt-4 flex flex-col gap-1">
              {[
                ...guide.links,
                ...others.map((other) => ({
                  label: other.title,
                  href: `/guides/${other.slug}`,
                })),
              ]
                .filter(
                  (link, i, all) =>
                    all.findIndex((l) => l.href === link.href) === i,
                )
                .map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                    >
                      {link.label}
                      <ArrowRightIcon
                        aria-hidden="true"
                        className="ml-auto size-3.5 shrink-0 opacity-40"
                      />
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        </Container>
      </Section>
    </>
  );
}

function List({ items, ordered }: { items: string[]; ordered?: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-5 sm:p-6">
      {items.map((item, i) => (
        <li key={item} className="flex gap-3.5">
          <span
            aria-hidden="true"
            className="tnum flex size-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-xs font-semibold text-muted"
          >
            {ordered ? i + 1 : "•"}
          </span>
          <span className="pt-0.5 text-[0.9375rem] leading-relaxed text-fg">
            <GuideText text={item} />
          </span>
        </li>
      ))}
    </Tag>
  );
}
