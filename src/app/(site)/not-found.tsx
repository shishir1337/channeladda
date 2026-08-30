import type { Metadata } from "next";
import { NotFoundContent } from "@/components/site/not-found-content";

export const metadata: Metadata = {
  title: "Page not found",
};

/** Handles `notFound()` thrown inside the (site) group — chrome comes from the
 *  group layout, so only the body is rendered here. */
export default function SiteNotFound() {
  return <NotFoundContent />;
}
