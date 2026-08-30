import type { ReactNode } from "react";
import { AnnouncementBar } from "@/components/site/announcement-bar";
import { MobileActionBar } from "@/components/site/mobile-action-bar";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

/**
 * Header, footer and skip link for the public marketplace. Lives in its own
 * component because the root `not-found` sits outside the (site) route group
 * and still needs the same chrome.
 */
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:inline-flex focus:h-12 focus:items-center focus:rounded-xl focus:bg-primary focus:px-5 focus:text-sm focus:font-semibold focus:text-primary-fg focus:shadow-lift"
      >
        Skip to main content
      </a>

      <AnnouncementBar />
      <SiteHeader />

      {/* Bottom padding clears the mobile action bar on small screens. */}
      <main id="main" className="flex-1 pb-20 lg:pb-0">
        {children}
      </main>

      <SiteFooter />
      <MobileActionBar />
    </>
  );
}
