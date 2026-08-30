import type { Metadata } from "next";
import { LegalPage } from "@/components/site/legal-page";
import { legalDocs } from "@/data/legal";

const doc = legalDocs.privacy;

export const metadata: Metadata = {
  title: doc.title,
  description: doc.summary,
  alternates: { canonical: "/privacy" },
};

export default function Page() {
  return <LegalPage doc={doc} />;
}
