import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/**
 * Public pages are open to crawlers; accounts, staff desks, the API and the
 * sign-in screens are not. Nothing here is a security control — every one
 * of those pages checks who is asking — it only keeps them out of search.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/dashboard",
        "/api/",
        "/signin",
        "/signup",
        "/verify-email",
        "/forgot-password",
        "/reset-password",
        "/invite",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
