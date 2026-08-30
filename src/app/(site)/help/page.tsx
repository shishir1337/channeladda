import { ArrowRightIcon, LifeBuoyIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Container, Section } from "@/components/ui/section";
import { helpArticles, helpCategories } from "@/data/help";

export const metadata: Metadata = {
  title: "Help centre",
  description:
    "Guides on escrow, listing an account, verifying ownership, getting paid and opening a dispute.",
  alternates: { canonical: "/help" },
};

export default function HelpPage() {
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Help" }]}
        eyebrow="Help centre"
        title="Guides, not FAQ filler"
        description="Written for the questions people actually ask before their first deal — what escrow does with your money, what a handover involves, and what happens when it goes wrong."
      />

      <Section>
        <Container>
          <div className="flex flex-col gap-10">
            {helpCategories.map((category) => {
              const articles = helpArticles.filter(
                (a) => a.category === category.id,
              );
              if (!articles.length) return null;

              return (
                <section key={category.id}>
                  <h2 className="font-display text-xl font-bold">
                    {category.label}
                  </h2>
                  <p className="mt-1.5 text-sm text-muted">{category.blurb}</p>

                  <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {articles.map((article) => (
                      <li key={article.slug}>
                        <Link
                          href={`/help/${article.slug}`}
                          className="lift-card group flex h-full flex-col rounded-card border border-line bg-surface p-5 hover:border-primary/45"
                        >
                          <h3 className="flex items-start gap-1.5 font-display text-[0.9375rem] font-semibold">
                            {article.title}
                            <ArrowRightIcon
                              aria-hidden="true"
                              className="mt-0.5 size-4 shrink-0 text-subtle transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:translate-x-0.5 group-hover:text-primary-text"
                            />
                          </h3>
                          <p className="mt-2 text-sm leading-relaxed text-muted">
                            {article.summary}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          <div className="mt-12 flex flex-col items-start gap-4 rounded-panel border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="flex items-start gap-3.5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-text">
                <LifeBuoyIcon aria-hidden="true" className="size-5" />
              </span>
              <div className="max-w-lg">
                <h2 className="font-display text-lg font-semibold">
                  Cannot find it?
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  Live chat replies in under ten minutes, every day of the year.
                </p>
              </div>
            </div>
            <Button asChild size="lg" className="shrink-0">
              <Link href="/support">Contact support</Link>
            </Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
