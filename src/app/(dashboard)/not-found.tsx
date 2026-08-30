import type { Metadata } from "next";
import { NotFoundContent } from "@/components/site/not-found-content";

export const metadata: Metadata = {
  title: "Not found",
  robots: { index: false, follow: false },
};

/**
 * Handles `notFound()` thrown inside the (dashboard) group — most often a
 * listing id that belongs to somebody else.
 *
 * Without this, the root not-found would render here instead, and because that
 * one draws the chrome itself the page would end up with two `<main id="main">`
 * elements nested inside each other.
 */
export default function DashboardNotFound() {
  return <NotFoundContent />;
}
