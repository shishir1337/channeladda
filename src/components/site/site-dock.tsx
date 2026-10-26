"use client";

import {
  ArrowLeftRightIcon,
  HouseIcon,
  MenuIcon,
  MessageSquareIcon,
  SearchIcon,
  TagIcon,
  UserRoundIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { Dock, DockButton, DockLink } from "@/components/app/dock";
import { useMemberCounts } from "@/components/site/member-counts";
import { useSiteMenu } from "@/components/site/site-menu";
import { HUE_TEXT, iconText } from "@/components/ui/icon-hue";
import { useSession } from "@/lib/auth-client";
import { isTabActive, type SiteTabIcon, siteTabs } from "@/lib/site-dock";

const ICONS = {
  home: HouseIcon,
  browse: SearchIcon,
  sell: TagIcon,
  signin: UserRoundIcon,
  deals: ArrowLeftRightIcon,
  messages: MessageSquareIcon,
} as const;

/**
 * Each tab's colour when lit, the dashboard's own: the icon's colour where it
 * has one, and for Home and Browse — a house and a magnifier, which are
 * controls to the icon families — the sky and cyan the dashboard gives them.
 */
const TINT: Record<SiteTabIcon, string> = {
  home: HUE_TEXT.sky,
  browse: HUE_TEXT.cyan,
  sell: iconText(TagIcon),
  signin: iconText(UserRoundIcon),
  deals: iconText(ArrowLeftRightIcon),
  messages: iconText(MessageSquareIcon),
};

/**
 * The phone's tab bar on the website. Signed in, the dashboard's own bar;
 * signed out, Home, Browse, Sell and Sign in. "More" opens the site's menu,
 * as it opens the account's menu in the dashboard.
 *
 * The pages it sits on are static, so who is looking comes from the browser,
 * as the header's account menu and balance do. Until the session is known
 * it shows the signed-out tabs, as the header does, rather than an empty bar.
 */
export function SiteDock({ lost = false }: { lost?: boolean }) {
  const pathname = usePathname();
  // On the 404 no tab is lit and Sign in goes to plain /signin, the same on
  // the server and in the browser (`SiteChrome`'s `lost`). Signing in from a
  // page that is not there has nowhere to come back to anyway; it used to
  // come back to "/_not-found".
  const here = lost ? null : pathname;
  const menu = useSiteMenu();
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user);
  const counts = useMemberCounts();

  const tabs = siteTabs(here ?? "/", signedIn ? { counts } : null);

  return (
    <Dock>
      {tabs.map((tab) => (
        <DockLink
          key={tab.icon}
          href={tab.href}
          label={tab.label}
          icon={ICONS[tab.icon]}
          tint={TINT[tab.icon]}
          active={here !== null && isTabActive(here, tab.href)}
          waiting={tab.waiting}
        />
      ))}
      <DockButton
        label="More"
        icon={MenuIcon}
        aria-haspopup="dialog"
        aria-expanded={menu.open}
        onClick={(event) => menu.openFrom(event.currentTarget)}
      />
    </Dock>
  );
}
