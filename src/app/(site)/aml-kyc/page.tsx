import type { Metadata } from "next";
import { LegalPage } from "@/components/site/legal-page";
import { legalDocs } from "@/data/legal";

const doc = legalDocs["aml-kyc"];

export const metadata: Metadata = {
  title: doc.title,
  description: doc.summary,
  alternates: { canonical: "/aml-kyc" },
};

export default function Page() {
  return <LegalPage doc={doc} />;
}
