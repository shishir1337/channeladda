import {
  ArrowLeftRightIcon,
  ArrowUpRightIcon,
  AwardIcon,
  ClapperboardIcon,
  MegaphoneIcon,
  ShieldAlertIcon,
  TrendingUpIcon,
} from "lucide-react";
import Link from "next/link";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { services } from "@/data/site";

const iconMap = {
  megaphone: MegaphoneIcon,
  clapperboard: ClapperboardIcon,
  award: AwardIcon,
  "trending-up": TrendingUpIcon,
  "shield-alert": ShieldAlertIcon,
  "arrow-left-right": ArrowLeftRightIcon,
} as const;

export function Services() {
  return (
    <Section
      id="services"
      className="scroll-mt-24 border-y border-line bg-bg-subtle"
    >
      <Container>
        <SectionHeading
          eyebrow="Channel Adda services"
          title="Growth and recovery work, handled in-house"
          description="Buying the account is step one. These are the add-ons buyers and sellers ask for most, run by vetted specialists under the same escrow protection."
        />

        <ul className="mt-9 grid gap-3 sm:mt-12 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {services.map((service) => {
            const Icon = iconMap[service.icon as keyof typeof iconMap];
            return (
              <li key={service.slug}>
                <Link
                  href={`/services/${service.slug}`}
                  className="lift-card group flex h-full items-start gap-4 rounded-card border border-line bg-surface p-5 hover:border-primary/45 sm:p-6"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted transition-colors duration-300 group-hover:bg-primary-soft group-hover:text-primary-text">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="flex items-center gap-1.5 font-display text-base font-semibold">
                      {service.title}
                      <ArrowUpRightIcon
                        aria-hidden="true"
                        className="size-4 shrink-0 text-subtle transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary-text"
                      />
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      {service.description}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </Container>
    </Section>
  );
}
