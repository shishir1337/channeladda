import { SiteChrome } from "@/components/site/site-chrome";

/**
 * Chrome for every public marketplace page. Dashboards get their own group so
 * they never inherit the marketing header.
 */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return <SiteChrome>{children}</SiteChrome>;
}
