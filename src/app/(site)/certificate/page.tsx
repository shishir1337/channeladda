import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Container, Section } from "@/components/ui/section";

export const metadata: Metadata = {
  title: "Check a certificate",
  description:
    "Check that a Channel Adda certificate of transfer is genuine, by the code printed on it.",
  alternates: { canonical: "/certificate" },
};

/**
 * Where a code read off a printed certificate is typed. The form is a
 * plain GET, so it works before any script has loaded.
 */
export default async function CertificateIndexPage({
  searchParams,
}: PageProps<"/certificate">) {
  const { code } = await searchParams;
  if (typeof code === "string" && code.trim()) {
    redirect(`/certificate/${encodeURIComponent(code.trim())}`);
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Certificates" }]}
        title="Check a certificate"
        description="Every completed deal comes with a certificate of transfer. Type its code to see if it is genuine."
      />
      <Section className="pt-6 sm:pt-8">
        <Container narrow>
          <form
            action="/certificate"
            className="flex max-w-xl flex-col gap-3 sm:flex-row"
          >
            <label htmlFor="certificate-code" className="sr-only">
              Certificate code
            </label>
            <input
              id="certificate-code"
              name="code"
              required
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="CA-12345-ABCD2345"
              className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 font-mono text-[0.9375rem] text-fg uppercase placeholder:text-subtle placeholder:normal-case focus-visible:border-line-strong focus-visible:outline-2 focus-visible:outline-ring"
            />
            <Button type="submit" size="lg">
              Check
            </Button>
          </form>
        </Container>
      </Section>
    </>
  );
}
