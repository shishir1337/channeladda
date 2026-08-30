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
      description="Pick something you have not used elsewhere. This account can hold money, so it is worth a strong one."
      footer={
        <p>
          Link expired?{" "}
          <Link
            href="/forgot-password"
            className="font-medium text-primary-text underline-offset-4 hover:underline"
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
