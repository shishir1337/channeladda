import { CalendarIcon } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Container, Section } from "@/components/ui/section";
import { type LegalDoc, legalDocs } from "@/data/legal";

const order = ["terms", "privacy", "refunds", "aml-kyc", "listing-rules"];

/** Shared renderer for all five policy documents. */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: doc.title }]}
        eyebrow="Legal"
        title={doc.title}
        description={doc.summary}
      >
        <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted">
          <CalendarIcon aria-hidden="true" className="size-3.5" />
          Last updated {doc.updated}
        </p>
      </PageHeader>

      <Section>
        <Container>
          <div className="lg:grid lg:grid-cols-[1fr_15rem] lg:gap-12">
            <article className="max-w-2xl">
              <div className="flex flex-col gap-10">
                {doc.sections.map((section) => (
                  <section key={section.heading}>
                    <h2 className="font-display text-xl font-semibold">
                      {section.heading}
                    </h2>

                    {section.paragraphs?.length ? (
                      <div className="mt-3 flex flex-col gap-4">
                        {section.paragraphs.map((text) => (
                          <p
                            key={text.slice(0, 40)}
                            className="text-[0.9375rem] leading-relaxed text-muted"
                          >
                            {text}
                          </p>
                        ))}
                      </div>
                    ) : null}

                    {section.bullets?.length ? (
                      <ul className="mt-4 flex flex-col gap-2.5">
                        {section.bullets.map((item) => (
                          <li
                            key={item}
                            className="flex gap-3 text-[0.9375rem] leading-relaxed text-muted"
                          >
                            <span
                              aria-hidden="true"
                              className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                            />
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                ))}
              </div>

              <p className="mt-12 rounded-card border border-line bg-surface-2 p-5 text-sm leading-relaxed text-muted">
                Something here unclear or unfair? Tell us at{" "}
                <span className="font-medium text-fg">
                  legal@channeladda.com
                </span>{" "}
                — policies that people cannot understand are not doing their
                job.
              </p>
            </article>

            <aside className="mt-10 lg:mt-0">
              <nav aria-label="Policies" className="lg:sticky lg:top-24">
                <h2 className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
                  All policies
                </h2>
                <ul className="mt-3 flex flex-col gap-1">
                  {order.map((slug) => {
                    const other = legalDocs[slug];
                    const current = other.slug === doc.slug;
                    return (
                      <li key={slug}>
                        <Link
                          href={`/${other.slug}`}
                          aria-current={current ? "page" : undefined}
                          className={`flex min-h-11 items-center rounded-lg px-3 text-sm transition-colors ${
                            current
                              ? "bg-primary-soft font-medium text-primary-text"
                              : "text-muted hover:bg-surface-2 hover:text-fg"
                          }`}
                        >
                          {other.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </aside>
          </div>
        </Container>
      </Section>
    </>
  );
}
