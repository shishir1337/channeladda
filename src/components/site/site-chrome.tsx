import type { ReactNode } from "react";
import { AnnouncementBar } from "@/components/site/announcement-bar";
import { SiteDock } from "@/components/site/site-dock";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SiteMenuProvider } from "@/components/site/site-menu";

/**
 * Header, footer, the phone's tab bar and the skip link for the public
 * marketplace. Lives in its own component because the root `not-found` sits
 * outside the (site) route group and still needs the same chrome.
 *
 * The room the tab bar needs is left at the foot of the footer, the last
 * thing on every page, so nothing ends up behind it.
 */
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <SiteMenuProvider>
      <a
        href="#main"
        className="sr-only z-50 focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:inline-flex focus:h-12 focus:items-center focus:rounded-xl focus:bg-primary focus:px-5 focus:text-sm focus:font-semibold focus:text-primary-fg focus:shadow-lift"
      >
        Skip to main content
      </a>

      <AnnouncementBar />
      <SiteHeader />

      <main id="main" className="flex-1">
        {children}
      </main>

      <SiteFooter />
      <SiteDock />
    </SiteMenuProvider>
  );
}
