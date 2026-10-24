import { BadgeCheckIcon, SearchXIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Container, Section } from "@/components/ui/section";
import type { Platform } from "@/generated/prisma/enums";
import { verifyCertificate } from "@/server/certificate";

export const metadata: Metadata = {
  title: "Check a certificate",
  // A page per deal, reached only through its own certificate.
  robots: { index: false, follow: false },
};

const PLATFORM_NAME: Record<Platform, string> = {
  YOUTUBE: "YouTube",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  TELEGRAM: "Telegram",
  WEBSITE: "Website",
};

const day = (date: Date) =>
  date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * Whether a certificate is genuine, for whoever was shown it: a platform's
 * support desk, a later buyer, a lawyer. It confirms the account, both
 * names and the date — what the certificate claims — and leaves the price
 * to the people who were in the deal.
 */
export default async function CertificateCheckPage({
  params,
}: PageProps<"/certificate/[code]">) {
  const { code } = await params;
  const certificate = await verifyCertificate(decodeURIComponent(code));

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Certificates", href: "/certificate" },
          { label: "Check" },
        ]}
        title="Check a certificate"
      />
      <Section className="pt-6 sm:pt-8">
        <Container narrow>
          {certificate ? (
            <div className="max-w-2xl overflow-hidden rounded-panel border border-verified/30 bg-surface">
              <div className="flex items-center gap-3 border-b border-verified/20 bg-verified-soft px-5 py-4 sm:px-6">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-verified text-bg">
                  <BadgeCheckIcon aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-base font-semibold text-fg">
                    This certificate is genuine
                  </p>
                  <p className="text-[0.8125rem] text-muted">
                    Issued by Channel Adda for deal {certificate.reference}.
                  </p>
                </div>
              </div>
              <dl className="divide-y divide-line text-sm">
                <Row
                  label="Account"
                  value={`${certificate.handle} on ${PLATFORM_NAME[certificate.platform]}`}
                />
                <Row label="From the seller" value={certificate.sellerName} />
                <Row label="To the buyer" value={certificate.buyerName} />
                <Row
                  label="Transfer completed"
                  value={day(certificate.completedAt)}
                />
                <Row
                  label="Deal type"
                  value={
                    certificate.mode === "SAFEST"
                      ? "Safest, with our agent holding the account"
                      : "Fastest, with our agent holding the money"
                  }
                />
                <Row label="Certificate no." value={certificate.code} mono />
              </dl>
            </div>
          ) : (
            <div className="max-w-2xl rounded-panel border border-danger/25 bg-danger-soft/60 p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <SearchXIcon
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-danger"
                />
                <div className="min-w-0">
                  <p className="text-base font-semibold text-fg">
                    We could not find this certificate
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    Check the code letter by letter. If it is right, the
                    certificate is not one of ours, or the deal it came from was
                    reopened.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="secondary">
                      <Link href="/certificate">Try another code</Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <Link href="/support">Contact support</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Container>
      </Section>
    </>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
      <dt className="text-muted">{label}</dt>
      <dd
        className={
          mono
            ? "font-mono text-[0.8125rem] font-medium break-all text-fg"
            : "font-medium break-words text-fg sm:text-right"
        }
      >
        {value}
      </dd>
    </div>
  );
}
