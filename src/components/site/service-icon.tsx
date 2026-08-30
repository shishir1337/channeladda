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

/** Resolves a service's icon name to a component in one place. */
export function ServiceIcon({
  name,
  ...props
}: { name: string } & SVGProps<SVGSVGElement>) {
  const Icon = iconMap[name as keyof typeof iconMap] ?? MegaphoneIcon;
  return <Icon aria-hidden="true" {...props} />;
}
