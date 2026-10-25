"use client";

import {
  ArrowLeftRightIcon,
  HouseIcon,
  LayoutDashboardIcon,
  MenuIcon,
  MessageSquareIcon,
  SearchIcon,
  TagIcon,
  UserRoundIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Dock, DockButton, DockLink } from "@/components/app/dock";
import { useSiteMenu } from "@/components/site/site-menu";
import { HUE_TEXT, iconText } from "@/components/ui/icon-hue";
import { useSession } from "@/lib/auth-client";
import {
  isTabActive,
  type MemberCounts,
  type SiteTabIcon,
  siteTabs,
} from "@/lib/site-dock";

const ICONS = {
  home: HouseIcon,
  overview: LayoutDashboardIcon,
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
  overview: iconText(LayoutDashboardIcon),
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
export function SiteDock() {
  const pathname = usePathname();
  const menu = useSiteMenu();
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user);
  const [counts, setCounts] = useState<MemberCounts | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger here, not a value the body reads
  useEffect(() => {
    if (!signedIn) {
      setCounts(null);
      return;
    }
    let live = true;
    const load = async () => {
      try {
        const response = await fetch("/api/waiting", { cache: "no-store" });
        const body = (await response.json()) as MemberCounts;
        if (live) setCounts(body);
      } catch {
        // A count that fails to load is left off, not an error.
      }
    };
    void load();
    window.addEventListener("focus", load);
    return () => {
      live = false;
      window.removeEventListener("focus", load);
    };
    // Each page asks again, as the balance does: a step taken there may
    // have changed what is waiting.
  }, [signedIn, pathname]);

  const tabs = siteTabs(pathname, signedIn ? { counts } : null);

  return (
    <Dock>
      {tabs.map((tab) => (
        <DockLink
          key={tab.icon}
          href={tab.href}
          label={tab.label}
          icon={ICONS[tab.icon]}
          tint={TINT[tab.icon]}
          active={isTabActive(pathname, tab.href)}
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
