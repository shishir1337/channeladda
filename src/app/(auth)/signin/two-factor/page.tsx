import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { TwoFactorChallenge } from "@/components/auth/two-factor-challenge";
import { supportHref } from "@/lib/support";

export const metadata: Metadata = {
  title: "Two-step verification",
  robots: { index: false, follow: false },
};

/**
 * The second step.
 *
 * Deliberately not guarded by `requireUser`: at this point the password has
 * been accepted but the session is not usable yet, so there is nobody to
 * require. Better Auth holds the half-finished sign-in in its own short-lived
 * cookie, and the verify call either completes it or does nothing.
 */
export default async function TwoFactorPage({
  searchParams,
}: PageProps<"/signin/two-factor">) {
  const { next } = await searchParams;

  return (
    <AuthShell
      title="One more step"
      description="Your password was right. Now the code from your authenticator app."
      footer={
        <p>
          Locked out?{" "}
          <Link
            href={supportHref("I am locked out of my account")}
            className="font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-fg"
          >
            Contact support
          </Link>{" "}
          — we will ask you to prove the account is yours, and it will not be
          quick, because anything quicker would be a way in for somebody else.
        </p>
      }
    >
      <TwoFactorChallenge
        next={typeof next === "string" ? next : "/dashboard"}
      />
    </AuthShell>
  );
}
