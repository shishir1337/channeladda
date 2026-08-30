import {
  ArrowRightIcon,
  CheckIcon,
  ShieldCheckIcon,
  TimerIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ServiceIcon } from "@/components/site/service-icon";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Price } from "@/components/ui/price";
import { Container, Section } from "@/components/ui/section";
import { serviceMap, services } from "@/data/site";

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps<"/services/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const service = serviceMap[slug];
  if (!service) return { title: "Service not found" };

  return {
    title: service.title,
    description: service.description,
    openGraph: { title: service.title, description: service.description },
    alternates: { canonical: `/services/${service.slug}` },
  };
}

export default async function ServicePage({
  params,
}: PageProps<"/services/[slug]">) {
  const { slug } = await params;
  const service = serviceMap[slug];
  if (!service) notFound();

  const others = services.filter((s) => s.slug !== service.slug).slice(0, 3);

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Services", href: "/services" },
          { label: service.title },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-text sm:size-14">
              <ServiceIcon name={service.icon} className="size-6" />
            </span>
            {service.title}
          </span>
        }
        description={service.description}
      />

      <Section>
        <Container>
          <div className="lg:grid lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-10">
            <div className="min-w-0">
              <p className="text-base leading-relaxed text-fg sm:text-lg">
                {service.body}
              </p>

              <h2 className="mt-9 font-display text-lg font-semibold">
                What is included
              </h2>
              <ul className="mt-4 flex flex-col gap-3">
                {service.includes.map((item) => (
                  <li key={item} className="flex gap-3 text-[0.9375rem]">
                    <CheckIcon
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-verified"
                    />
                    <span className="leading-relaxed text-muted">{item}</span>
                  </li>
                ))}
              </ul>

              {service.caution ? (
                <div className="mt-8 rounded-card border border-danger/30 bg-danger-soft p-5">
                  <h2 className="flex items-center gap-2.5 font-display text-base font-semibold text-danger">
                    <TriangleAlertIcon
                      aria-hidden="true"
                      className="size-5 shrink-0"
                    />
                    Read this before you order
                  </h2>
                  <p className="mt-2.5 text-sm leading-relaxed text-muted">
                    {service.caution}
                  </p>
                </div>
              ) : null}

              <div className="mt-9 rounded-card border border-line bg-surface p-5 sm:p-6">
                <h2 className="flex items-center gap-2.5 font-display text-base font-semibold">
                  <ShieldCheckIcon
                    aria-hidden="true"
                    className="size-5 text-verified"
                  />
                  How ordering works
                </h2>
                <ol className="mt-4 flex flex-col gap-3">
                  {[
                    "Send a brief with the account and what you want to achieve.",
                    "We confirm scope, price and a delivery date in writing.",
                    "You pay into escrow — the specialist is not paid yet.",
                    "Work is delivered and you confirm before the money is released.",
                  ].map((step, i) => (
                    <li key={step} className="flex gap-3.5">
                      <span className="tnum flex size-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-xs font-semibold text-muted">
                        {i + 1}
                      </span>
                      <span className="pt-0.5 text-sm leading-relaxed text-muted">
                        {step}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <aside className="mt-8 lg:sticky lg:top-24 lg:mt-0">
              <div className="rounded-panel border border-line bg-surface p-5 shadow-soft sm:p-6">
                <dl className="space-y-4">
                  <div>
                    <dt className="text-xs text-subtle">Starting from</dt>
                    <dd className="mt-1 text-2xl font-semibold">
                      {service.fromPrice === 0 ? (
                        <span className="text-verified">Free</span>
                      ) : (
                        <Price usd={service.fromPrice} />
                      )}
                    </dd>
                  </div>
                  <div className="border-t border-line pt-4">
                    <dt className="text-xs text-subtle">Typical turnaround</dt>
                    <dd className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                      <TimerIcon aria-hidden="true" className="size-4" />
                      {service.turnaround}
                    </dd>
                  </div>
                </dl>

                <Button asChild size="lg" className="mt-6 w-full">
                  <Link href="/support">Request this service</Link>
                </Button>
                <p className="mt-3 text-center text-xs text-subtle">
                  Final price is quoted after we see the account.
                </p>
              </div>

              <div className="mt-4 rounded-card border border-line bg-surface p-5">
                <h2 className="font-display text-sm font-semibold">
                  Other services
                </h2>
                <ul className="mt-3 flex flex-col gap-1">
                  {others.map((other) => (
                    <li key={other.slug}>
                      <Link
                        href={`/services/${other.slug}`}
                        className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                      >
                        <ServiceIcon
                          name={other.icon}
                          className="size-4 shrink-0 text-subtle"
                        />
                        {other.title}
                        <ArrowRightIcon
                          aria-hidden="true"
                          className="ml-auto size-3.5 opacity-40"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </Container>
      </Section>
    </>
  );
}
