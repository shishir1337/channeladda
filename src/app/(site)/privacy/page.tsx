import type { Metadata } from "next";
import { LegalPage } from "@/components/site/legal-page";
import { legalDocs } from "@/data/legal";
import { pageMetadata } from "@/lib/seo";

const doc = legalDocs.privacy;

export const metadata: Metadata = pageMetadata({
  title: doc.title,
  description: doc.summary,
  path: "/privacy",
});

export default function Page() {
  return <LegalPage doc={doc} />;
}
