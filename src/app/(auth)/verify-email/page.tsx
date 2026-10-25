import { CheckCircle2Icon, MailWarningIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { IconTile } from "@/components/app/kit";
import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";
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

  // ?verified=1 arrives from the code form below, and from a confirmation
  // link sent before codes replaced them. ?error is only ever one of those
  // old links, gone stale.
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
            away. An ID check is optional: do it any time for the Verified
            badge.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {user ? (
              <>
                <Button asChild size="md">
                  <Link href="/browse">Browse accounts</Link>
                </Button>
                <Button asChild variant="secondary" size="md">
                  <Link href="/dashboard/listings/new">Create a listing</Link>
                </Button>
              </>
            ) : (
              // Confirmed from another device: a code proves the inbox, not
              // the password, so it does not sign anyone in.
              <Button asChild size="md">
                <Link href="/signin">Sign in</Link>
              </Button>
            )}
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
          ? "We confirm addresses with a six-digit code now. Ask for one below and enter it here."
          : user
            ? `We sent a six-digit code to ${user.email}. Enter it below and your account is ready.`
            : "Enter the six-digit code from our email and your account is ready."
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
          Enter your code
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Not in your inbox? Check spam first — it sometimes lands there. If it
          is missing or has expired, send a new one.
        </p>
        <VerifyEmailForm email={user?.email} />
      </div>
    </AuthShell>
  );
}
