import { ArrowUpRightIcon, ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ServiceIcon, serviceIcon } from "@/components/site/service-icon";
import { iconTile } from "@/components/ui/icon-hue";
import { PageHeader } from "@/components/ui/page-header";
import { Price } from "@/components/ui/price";
import { Container, Section } from "@/components/ui/section";
import { services } from "@/data/site";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Promotion, faceless video production, award claims, strike appeals and supervised transfers — run by vetted specialists, arranged through Channel Adda.",
  alternates: { canonical: "/services" },
};

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Services" }]}
        title="Growth and recovery work, handled in-house"
        description="Buying the account is step one. These are the add-ons buyers and sellers ask for most, run by vetted specialists and arranged through us."
      />

      <Section>
        <Container>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <li key={service.slug}>
                <Link
                  href={`/services/${service.slug}`}
                  className="lift-card group flex h-full flex-col rounded-card border border-line bg-surface p-5 hover:border-line-strong sm:p-6"
                >
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${iconTile(serviceIcon(service.icon))}`}
                  >
                    <ServiceIcon name={service.icon} className="size-4.5" />
                  </span>

                  <h2 className="mt-4 flex items-start gap-1.5 text-base font-semibold text-fg">
                    {service.title}
                    <ArrowUpRightIcon
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-subtle transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-fg"
                    />
                  </h2>
                  <p className="mt-2.5 text-sm leading-relaxed text-muted">
                    {service.description}
                  </p>

                  <dl className="mt-auto flex items-end justify-between gap-3 border-t border-line pt-4 text-sm">
                    <div>
                      <dt className="text-xs text-subtle">From</dt>
                      <dd className="tnum mt-0.5 font-semibold text-fg">
                        {service.fromPrice === 0 ? (
                          <span>Free</span>
                        ) : (
                          <Price usd={service.fromPrice} />
                        )}
                      </dd>
                    </div>
                    <div className="text-right">
                      <dt className="text-xs text-subtle">Turnaround</dt>
                      <dd className="mt-0.5 text-[0.8125rem] font-medium text-muted">
                        {service.turnaround}
                      </dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-6 flex items-start gap-2.5 text-sm leading-relaxed text-muted">
            <ShieldCheckIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-verified"
            />
            <span>
              A service order works like a Fastest deal: you pay Channel Adda,
              the specialist delivers, and the money reaches them once you
              confirm the work is done. Unlike an account sale there is nothing
              to take custody of, so the money is the only thing being held.
            </span>
          </p>
        </Container>
      </Section>
    </>
  );
}
