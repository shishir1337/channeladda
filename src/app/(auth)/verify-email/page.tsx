import { CheckCircle2Icon, MailWarningIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
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
        <div className="rounded-panel border border-verified/30 bg-verified-soft p-6">
          <span className="flex size-12 items-center justify-center rounded-xl bg-surface text-verified">
            <CheckCircle2Icon aria-hidden="true" className="size-6" />
          </span>
          <h2 className="mt-5 font-display text-lg font-bold">
            You are all set
          </h2>
          <p className="mt-2.5 text-sm leading-relaxed text-muted">
            You can save listings, send offers and message sellers straight
            away. Identity checks only come in before a seller&apos;s first
            listing goes live.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="md">
              <Link href="/browse">Browse accounts</Link>
            </Button>
            <Button asChild variant="secondary" size="md">
              <Link href="/sell">Create a listing</Link>
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
            className="font-medium text-primary-text underline-offset-4 hover:underline"
          >
            Sign up again
          </Link>
        </p>
      }
    >
      <div className="rounded-panel border border-line bg-surface p-6">
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary-soft text-primary-text">
          <MailWarningIcon aria-hidden="true" className="size-6" />
        </span>
        <h2 className="mt-5 font-display text-lg font-bold">
          {expired ? "Request a new link" : "Nothing in your inbox?"}
        </h2>
        <p className="mt-2.5 text-sm leading-relaxed text-muted">
          Check your spam folder first — verification mail sometimes lands
          there. If it is genuinely missing, we can send another.
        </p>
        <ResendVerification email={user?.email} />
      </div>
    </AuthShell>
  );
}
