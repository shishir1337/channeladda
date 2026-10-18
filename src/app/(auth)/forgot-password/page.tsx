import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Request a password reset link for your Channel Adda account.",
  alternates: { canonical: "/forgot-password" },
};

/** The only auth page with nothing per-request in it, so it is prerendered —
 *  and the shell's marketplace figures froze at whatever the build saw. */
export const revalidate = 60;

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      description="We will email you a link. It expires in one hour."
      footer={
        <p>
          Remembered it?{" "}
          <Link
            href="/signin"
            className="font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-fg"
          >
            Back to sign in
          </Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
