import type { ReactNode } from "react";
import { SiteNotificationSound } from "@/components/app/notification-sound";
import { AnnouncementBar } from "@/components/site/announcement-bar";
import { MemberCountsProvider } from "@/components/site/member-counts";
import { MessagesButton } from "@/components/site/messages-button";
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
export function SiteChrome({
  children,
  lost = false,
}: {
  children: ReactNode;
  /**
   * The root 404. It is drawn once, at build, for "/_not-found", and served
   * for whatever address was asked for — and /browse/<anything else> is sent
   * to it by `src/proxy.ts` — so the address in the browser is not the one
   * the page was drawn for. Nothing in the chrome may depend on it, or the
   * browser draws something else and React throws (#418): the tab bar lit
   * Browse on /browse/myspace, a tab the server had not lit.
   */
  lost?: boolean;
}) {
  return (
    <MemberCountsProvider>
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
        <SiteDock lost={lost} />
        <MessagesButton />
        {/* The chime for a signed-in member, heard from another tab too. */}
        <SiteNotificationSound />
      </SiteMenuProvider>
    </MemberCountsProvider>
  );
}
