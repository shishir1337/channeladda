import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = {
  title: "Choose a new password",
  description: "Set a new password for your Channel Adda account.",
  alternates: { canonical: "/reset-password" },
};

export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  return (
    <AuthShell
      title="Choose a new password"
      description="One you have not used anywhere else — this account can hold money."
      footer={
        <p>
          Link expired?{" "}
          <Link
            href="/forgot-password"
            className="font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-fg"
          >
            Request a new one
          </Link>
        </p>
      }
    >
      <ResetPasswordForm
        token={typeof token === "string" ? token : undefined}
      />
    </AuthShell>
  );
}
