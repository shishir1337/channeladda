import { ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/site/json-ld";
import { PageHeader } from "@/components/ui/page-header";
import { Container, Section } from "@/components/ui/section";
import { guides } from "@/data/guides";
import { readingMinutes } from "@/lib/guide-text";
import { breadcrumbLd, pageMetadata } from "@/lib/seo";
import { siteUrl } from "@/lib/site-url";

export const metadata: Metadata = pageMetadata({
  title: "Guides to Buying & Selling YouTube Channels",
  description:
    "How to buy or sell a YouTube channel safely, what a channel is worth, and how ownership moves to a new owner. Plain guides from the Channel Adda team.",
  path: "/guides",
});

export default function GuidesPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd(siteUrl(), [
          { name: "Home", path: "/" },
          { name: "Guides", path: "/guides" },
        ])}
      />
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Guides" }]}
        title="Buying and selling YouTube channels"
        description="What to check, what to pay, and how a channel moves to its new owner."
      />

      <Section>
        <Container>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {guides.map((guide) => (
              <li key={guide.slug}>
                <Link
                  href={`/guides/${guide.slug}`}
                  className="lift-card group flex h-full flex-col rounded-card border border-line bg-surface p-5 hover:border-line-strong"
                >
                  <h2 className="flex items-start gap-1.5 text-[0.9375rem] font-semibold">
                    {guide.title}
                    <ArrowRightIcon
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-subtle transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-fg"
                    />
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {guide.description}
                  </p>
                  <p className="mt-auto pt-4 text-[0.8125rem] text-subtle">
                    {readingMinutes(guide)} min read
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </Section>
    </>
  );
}
