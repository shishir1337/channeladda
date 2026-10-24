import {
  ArrowLeftRightIcon,
  AwardIcon,
  ClapperboardIcon,
  MegaphoneIcon,
  ShieldAlertIcon,
  TrendingUpIcon,
} from "lucide-react";
import type { SVGProps } from "react";

const iconMap = {
  megaphone: MegaphoneIcon,
  clapperboard: ClapperboardIcon,
  award: AwardIcon,
  "trending-up": TrendingUpIcon,
  "shield-alert": ShieldAlertIcon,
  "arrow-left-right": ArrowLeftRightIcon,
} as const;

/** The component for a service's icon name. */
export function serviceIcon(name: string) {
  return iconMap[name as keyof typeof iconMap] ?? MegaphoneIcon;
}

/** Resolves a service's icon name to a component in one place. */
export function ServiceIcon({
  name,
  ...props
}: { name: string } & SVGProps<SVGSVGElement>) {
  const Icon = serviceIcon(name);
  return <Icon aria-hidden="true" {...props} />;
}
