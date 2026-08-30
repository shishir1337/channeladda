import { ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Container, Section } from "@/components/ui/section";
import { helpArticleMap, helpArticles, helpCategories } from "@/data/help";

export function generateStaticParams() {
  return helpArticles.map((a) => ({ slug: a.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps<"/help/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const article = helpArticleMap[slug];
  if (!article) return { title: "Article not found" };

  return {
    title: article.title,
    description: article.summary,
    openGraph: { title: article.title, description: article.summary },
    alternates: { canonical: `/help/${article.slug}` },
  };
}

export default async function HelpArticlePage({
  params,
}: PageProps<"/help/[slug]">) {
  const { slug } = await params;
  const article = helpArticleMap[slug];
  if (!article) notFound();

  const category = helpCategories.find((c) => c.id === article.category);
  const related = helpArticles
    .filter((a) => a.category === article.category && a.slug !== article.slug)
    .slice(0, 3);

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Help", href: "/help" },
          { label: article.title },
        ]}
        eyebrow={category?.label}
        title={article.title}
        description={article.summary}
      />

      <Section>
        <Container className="max-w-3xl">
          <div className="flex flex-col gap-5 text-[1.0625rem] leading-relaxed text-muted">
            {article.body.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
          </div>

          {article.steps ? (
            <ol className="mt-9 flex flex-col gap-3 rounded-card border border-line bg-surface p-5 sm:p-6">
              {article.steps.map((step, i) => (
                <li key={step} className="flex gap-3.5">
                  <span className="tnum flex size-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-xs font-semibold text-muted">
                    {i + 1}
                  </span>
                  <span className="pt-0.5 text-[0.9375rem] leading-relaxed text-fg">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}

          {related.length ? (
            <div className="mt-12 border-t border-line pt-8">
              <h2 className="font-display text-lg font-semibold">
                More on {category?.label.toLowerCase()}
              </h2>
              <ul className="mt-4 flex flex-col gap-1">
                {related.map((other) => (
                  <li key={other.slug}>
                    <Link
                      href={`/help/${other.slug}`}
                      className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                    >
                      {other.title}
                      <ArrowRightIcon
                        aria-hidden="true"
                        className="ml-auto size-3.5 shrink-0 opacity-40"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild variant="secondary" size="md">
              <Link href="/help">Back to help centre</Link>
            </Button>
            <Button asChild variant="outline" size="md">
              <Link href="/support">Still stuck? Contact support</Link>
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
