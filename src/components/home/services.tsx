import {
  ArrowLeftRightIcon,
  ArrowUpRightIcon,
  AwardIcon,
  ClapperboardIcon,
  ClockIcon,
  MegaphoneIcon,
  ShieldAlertIcon,
  TrendingUpIcon,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { iconTile } from "@/components/ui/icon-hue";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { SERVICES_OPEN, services } from "@/data/site";

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
    <Section id="services" className="scroll-mt-24">
      <Container>
        <SectionHeading
          title="Growth and recovery work, handled in-house"
          description={
            SERVICES_OPEN
              ? "Buying the account is step one. These are the add-ons buyers and sellers ask for most, run by vetted specialists under the same protection as any other deal."
              : "Coming soon. The add-ons buyers and sellers ask for most, run by vetted specialists. We are not taking orders for them yet."
          }
        />

        <ul className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => {
            const Icon = iconMap[service.icon as keyof typeof iconMap];
            if (!SERVICES_OPEN) {
              return (
                <li key={service.slug}>
                  <div className="flex h-full items-start gap-4 rounded-card border border-line bg-surface p-5">
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${iconTile(Icon)}`}
                    >
                      <Icon aria-hidden="true" className="size-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[0.9375rem] font-semibold text-fg">
                        {service.title}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted">
                        {service.description}
                      </p>
                      <Badge variant="info" className="mt-3">
                        <ClockIcon aria-hidden="true" />
                        Coming soon
                      </Badge>
                    </div>
                  </div>
                </li>
              );
            }
            return (
              <li key={service.slug}>
                <Link
                  href={`/services/${service.slug}`}
                  className="lift-card group flex h-full items-start gap-4 rounded-card border border-line bg-surface p-5 hover:border-line-strong"
                >
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${iconTile(Icon)}`}
                  >
                    <Icon aria-hidden="true" className="size-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-fg">
                      {service.title}
                      <ArrowUpRightIcon
                        aria-hidden="true"
                        className="size-4 shrink-0 text-subtle transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-fg"
                      />
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">
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
