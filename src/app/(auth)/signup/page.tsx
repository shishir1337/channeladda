import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/auth/auth-forms";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  AuthDivider,
  GoogleButton,
  GoogleOffNote,
} from "@/components/auth/google-button";
import { isGoogleEnabled } from "@/lib/auth";

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
      description="Free, and about fifteen seconds. An email is all you need."
      footer={
        <p>
          Already have an account?{" "}
          <Link
            href="/signin"
            className="font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-fg"
          >
            Sign in
          </Link>
        </p>
      }
    >
      {isGoogleEnabled() ? (
        <>
          <GoogleButton label="Sign up with Google" />
          <AuthDivider />
        </>
      ) : (
        <GoogleOffNote />
      )}
      <SignUpForm />
    </AuthShell>
  );
}
