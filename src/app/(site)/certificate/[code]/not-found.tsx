import { SearchXIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Container, Section } from "@/components/ui/section";

/**
 * A certificate code that is not one of ours.
 *
 * Sent with a 404 — there is no certificate at this address — but it still
 * answers the question the visitor came with, and how to check again.
 */
export default function CertificateNotFound() {
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
        </Container>
      </Section>
    </>
  );
}
