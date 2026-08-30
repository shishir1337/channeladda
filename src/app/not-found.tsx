import type { Metadata } from "next";
import { NotFoundContent } from "@/components/site/not-found-content";
import { SiteChrome } from "@/components/site/site-chrome";

export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * Catches every unmatched URL. It sits outside the (site) route group, so it
 * renders the chrome itself.
 */
export default function NotFound() {
  return (
    <SiteChrome>
      <NotFoundContent />
    </SiteChrome>
  );
}
