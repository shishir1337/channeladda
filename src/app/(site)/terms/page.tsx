import type { Metadata } from "next";
import { LegalPage } from "@/components/site/legal-page";
import { legalDocs } from "@/data/legal";
import { pageMetadata } from "@/lib/seo";

const doc = legalDocs.terms;

export const metadata: Metadata = pageMetadata({
  title: doc.title,
  description: doc.summary,
  path: "/terms",
});

export default function Page() {
  return <LegalPage doc={doc} />;
}
