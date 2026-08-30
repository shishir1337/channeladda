import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/auth/auth-forms";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = {
  title: "Create an account",
  description:
    "Create a free Channel Adda account to save listings, send offers and sell your own accounts.",
  alternates: { canonical: "/signup" },
};

export default function SignUpPage() {
  return (
    <AuthShell
      title="Create your account"
      description="Free, and it takes about fifteen seconds. You only need an email address to browse, save listings and send offers."
      footer={
        <p>
          Already have an account?{" "}
          <Link
            href="/signin"
            className="font-medium text-primary-text underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
