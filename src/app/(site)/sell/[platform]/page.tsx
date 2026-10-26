import { ArrowRightIcon, CheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FaqList } from "@/components/site/faq-list";
import { JsonLd } from "@/components/site/json-ld";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { type PlatformId, platformMap, platforms } from "@/data/platforms";
import { sellDescription, sellFaqs, sellTitle } from "@/lib/platform-seo";
import { breadcrumbLd, pageMetadata } from "@/lib/seo";
import { siteUrl } from "@/lib/site-url";

export function generateStaticParams() {
  return platforms.map((p) => ({ platform: p.id }));
}

/** The five platforms are the whole set: anything else is a real 404. */
export const dynamicParams = false;

const NEW_LISTING = "/signup?next=%2Fdashboard%2Flistings%2Fnew";

/** The guides written for a seller on this platform. Only YouTube so far. */
const GUIDES: Partial<Record<PlatformId, { label: string; href: string }[]>> = {
  youtube: [
    {
      label: "How to sell a YouTube channel",
      href: "/guides/how-to-sell-a-youtube-channel",
    },
    {
      label: "How much is a YouTube channel worth?",
      href: "/guides/youtube-channel-value",
    },
    {
      label: "How to transfer YouTube channel ownership",
      href: "/guides/transfer-youtube-channel-ownership",
    },
  ],
};

export async function generateMetadata({
  params,
}: PageProps<"/sell/[platform]">): Promise<Metadata> {
  const { platform } = await params;
  const p = platformMap[platform as PlatformId];
  if (!p) return { title: "Platform not found" };
  return pageMetadata({
    title: sellTitle(p),
    description: sellDescription(p),
    path: `/sell/${p.id}`,
  });
}

export default async function SellPlatformPage({
  params,
}: PageProps<"/sell/[platform]">) {
  const { platform } = await params;
  const p = platformMap[platform as PlatformId];
  if (!p) notFound();

  const one = p.id === "website" ? "website" : p.labelOne;
  const steps = [
    {
      title: "List it free",
      body: "Add the link, the numbers and your price. No listing fee and no exclusivity.",
    },
    {
      title: "Prove you own it",
      body: `${p.ownershipCheck.steps.join(" ")} ${
        p.ownershipCheck.automatic
          ? "We check it automatically, and your listing goes live at once."
          : "A moderator checks it, then your listing goes live."
      }`,
    },
    { title: `Hand the ${p.noun} to our agent`, body: p.sellerNote },
    {
      title: "Get paid",
      body: `On Fastest the buyer has already paid us, and the money reaches your wallet once our agent holds the ${p.noun}. On Safest the buyer pays you directly.`,
    },
  ];
  const guides = GUIDES[p.id] ?? [];

  return (
    <>
      <JsonLd
        data={breadcrumbLd(siteUrl(), [
          { name: "Home", path: "/" },
          { name: "Sell", path: "/sell" },
          { name: p.name, path: `/sell/${p.id}` },
        ])}
      />
      <PageHeader
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Sell", href: "/sell" },
          { label: p.name },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface sm:size-14"
              style={{ color: p.tint }}
            >
              <p.icon className="size-6 sm:size-7" />
            </span>
            Sell your {one}
          </span>
        }
        description={`Free to list. Our agent holds the money or the ${p.noun}, so the buyer cannot run off.`}
        actions={
          <Button asChild size="lg">
            <Link href={NEW_LISTING}>
              Create a free listing
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        }
      >
        <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2.5">
          {[
            "Free to list",
            "You set the price",
            `${p.holdDays}-day hold on Fastest`,
          ].map((point) => (
            <li
              key={point}
              className="inline-flex items-center gap-2 text-sm text-muted"
            >
              <CheckIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-verified"
              />
              {point}
            </li>
          ))}
        </ul>
      </PageHeader>

      <Section>
        <Container>
          <SectionHeading title={`How selling a ${one} works`} />
          <ol className="mt-8 grid gap-2.5 sm:mt-10 sm:grid-cols-2 sm:gap-3">
            {steps.map((step, i) => (
              <li
                key={step.title}
                className="flex items-start gap-3.5 rounded-card border border-line bg-surface p-4 sm:p-5"
              >
                <span className="tnum flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-fg">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-[0.9375rem] font-semibold text-fg">
                    {step.title}
                  </h3>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      <Section className="border-t border-line">
        <Container>
          {/* On a phone the questions come straight after their heading,
              and the links to read next after the questions. */}
          <div className="grid gap-6 lg:grid-cols-[22rem_1fr] lg:gap-16">
            <div className="max-lg:contents">
              <h2 className="text-[1.5rem] leading-[1.2] font-semibold tracking-[-0.02em] sm:text-[1.75rem]">
                Questions sellers ask
              </h2>
              <div className="max-lg:order-last lg:mt-5">
                <p className="text-[0.8125rem] font-medium text-subtle">
                  Read next
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {[
                    { label: `${p.label} for sale`, href: `/browse/${p.id}` },
                    { label: "Recently sold", href: "/sold" },
                    { label: "Fees", href: "/fees" },
                    ...guides,
                  ].map((link) => (
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
            </div>
            <FaqList items={sellFaqs(p)} />
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="flex flex-col items-start gap-4 rounded-panel border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="max-w-lg">
              <h2 className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
                Ready to sell your {one}?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Sign up takes a few seconds.
              </p>
            </div>
            <Button asChild size="lg" className="shrink-0">
              <Link href={NEW_LISTING}>
                Create a free listing
                <ArrowRightIcon aria-hidden="true" className="size-4" />
              </Link>
            </Button>
          </div>
          <ul className="mt-8 flex flex-wrap gap-2">
            {platforms
              .filter((other) => other.id !== p.id)
              .map((other) => (
                <li key={other.id}>
                  <Link
                    href={`/sell/${other.id}`}
                    className="inline-flex min-h-11 items-center gap-2.5 rounded-xl border border-line bg-surface px-4 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
                  >
                    <other.icon
                      className="size-4 shrink-0"
                      style={{ color: other.tint }}
                    />
                    Sell {other.id === "website" ? "a website" : other.label}
                  </Link>
                </li>
              ))}
          </ul>
        </Container>
      </Section>
    </>
  );
}
