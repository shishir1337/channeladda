import type { Metadata } from "next";
import { LegalPage } from "@/components/site/legal-page";
import { legalDocs } from "@/data/legal";

const doc = legalDocs["listing-rules"];

export const metadata: Metadata = {
  title: doc.title,
  description: doc.summary,
  alternates: { canonical: "/listing-rules" },
};

export default function Page() {
  return <LegalPage doc={doc} />;
}
