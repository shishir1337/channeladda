import type { Metadata } from "next";
import { LegalPage } from "@/components/site/legal-page";
import { legalDocs } from "@/data/legal";
import { pageMetadata } from "@/lib/seo";

const doc = legalDocs["listing-rules"];

export const metadata: Metadata = pageMetadata({
  title: doc.title,
  description: doc.summary,
  path: "/listing-rules",
});

export default function Page() {
  return <LegalPage doc={doc} />;
}
