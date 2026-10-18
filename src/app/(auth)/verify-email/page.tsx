import { CheckCircle2Icon, MailWarningIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { IconTile } from "@/components/app/kit";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResendVerification } from "@/components/auth/resend-verification";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Verify your email",
  description:
    "Confirm your email address to finish setting up your Channel Adda account.",
  alternates: { canonical: "/verify-email" },
};

export default async function VerifyEmailPage({
  searchParams,
}: PageProps<"/verify-email">) {
  const params = await searchParams;
  const user = await getCurrentUser();

  // The token is consumed by /api/auth/verify-email, which then sends the
  // visitor back here with ?verified=1. This page never sees a raw token, so
  // it cannot leak one into a referrer header or a browser history entry.
  const verified = params.verified === "1" || user?.emailVerified === true;
  const expired =
    params.error === "expired" || params.error === "invalid_token";

  if (verified) {
    return (
      <AuthShell
        title="Email confirmed"
        description="That is everything. Your account is ready to use."
      >
        <div className="rounded-card border border-line bg-surface p-5 shadow-xs">
          <IconTile icon={CheckCircle2Icon} tone="verified" size="lg" />
          <h2 className="mt-4 text-[0.9375rem] font-semibold text-fg">
            You are all set
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            You can save listings, send offers and message sellers straight
            away. Identity checks only come in before a seller&apos;s first
            listing goes live.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild size="md">
              <Link href="/browse">Browse accounts</Link>
            </Button>
            <Button asChild variant="secondary" size="md">
              <Link href="/dashboard/listings/new">Create a listing</Link>
            </Button>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={expired ? "That link has expired" : "Confirm your email"}
      description={
        expired
          ? "Verification links are only valid for a short time. Request a new one and we will send it straight away."
          : "We have sent you a link. Open it on this device and your account is ready."
      }
      footer={
        <p>
          Wrong address?{" "}
          <Link
            href="/signup"
            className="font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-fg"
          >
            Sign up again
          </Link>
        </p>
      }
    >
      <div className="rounded-card border border-line bg-surface p-5 shadow-xs">
        <IconTile icon={MailWarningIcon} tone="primary" size="lg" />
        <h2 className="mt-4 text-[0.9375rem] font-semibold text-fg">
          {expired ? "Request a new link" : "Nothing in your inbox?"}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Check your spam folder first — verification mail sometimes lands
          there. If it is genuinely missing, we can send another.
        </p>
        <ResendVerification email={user?.email} />
      </div>
    </AuthShell>
  );
}
