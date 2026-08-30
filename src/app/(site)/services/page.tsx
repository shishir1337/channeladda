import { ArrowUpRightIcon, ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ServiceIcon } from "@/components/site/service-icon";
import { PageHeader } from "@/components/ui/page-header";
import { Price } from "@/components/ui/price";
import { Container, Section } from "@/components/ui/section";
import { services } from "@/data/site";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Promotion, faceless video production, award claims, strike appeals and supervised transfers — run by vetted specialists under the same escrow protection as a sale.",
  alternates: { canonical: "/services" },
};

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Services" }]}
        eyebrow="Channel Adda services"
        title="Growth and recovery work, handled in-house"
        description="Buying the account is step one. These are the add-ons buyers and sellers ask for most, run by vetted specialists and paid for through the same escrow."
      />

      <Section>
        <Container>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <li key={service.slug}>
                <Link
                  href={`/services/${service.slug}`}
                  className="lift-card group flex h-full flex-col rounded-card border border-line bg-surface p-5 hover:border-primary/45 sm:p-6"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted transition-colors duration-300 group-hover:bg-primary-soft group-hover:text-primary-text">
                    <ServiceIcon name={service.icon} className="size-5" />
                  </span>

                  <h2 className="mt-5 flex items-start gap-1.5 font-display text-base font-semibold sm:text-lg">
                    {service.title}
                    <ArrowUpRightIcon
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-subtle transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary-text"
                    />
                  </h2>
                  <p className="mt-2.5 text-sm leading-relaxed text-muted">
                    {service.description}
                  </p>

                  <dl className="mt-auto flex items-end justify-between gap-3 border-t border-line pt-4 text-sm">
                    <div>
                      <dt className="text-[0.6875rem] text-subtle">From</dt>
                      <dd className="mt-0.5 font-semibold">
                        {service.fromPrice === 0 ? (
                          <span className="text-verified">Free</span>
                        ) : (
                          <Price usd={service.fromPrice} />
                        )}
                      </dd>
                    </div>
                    <div className="text-right">
                      <dt className="text-[0.6875rem] text-subtle">
                        Turnaround
                      </dt>
                      <dd className="mt-0.5 text-xs font-medium text-muted">
                        {service.turnaround}
                      </dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-8 flex items-start gap-2.5 rounded-card border border-line bg-surface p-5 text-sm leading-relaxed text-muted">
            <ShieldCheckIcon
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-verified"
            />
            <span>
              Service orders run through the same escrow as an account sale. You
              pay Channel Adda, the specialist delivers, and the money is
              released once you confirm the work is done.
            </span>
          </p>
        </Container>
      </Section>
    </>
  );
}
