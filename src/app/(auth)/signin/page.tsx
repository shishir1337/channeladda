import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "@/components/auth/auth-forms";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthDivider, GoogleButton } from "@/components/auth/google-button";
import { isGoogleEnabled } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to your Channel Adda account to manage listings, offers and orders.",
  alternates: { canonical: "/signin" },
};

export default async function SignInPage({
  searchParams,
}: PageProps<"/signin">) {
  const { next, error } = await searchParams;
  const target = typeof next === "string" ? next : undefined;
  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to pick up an order, answer an offer, or check on a payout."
      footer={
        <p>
          New to Channel Adda?{" "}
          <Link
            href="/signup"
            className="font-medium text-primary-text underline-offset-4 hover:underline"
          >
            Create a free account
          </Link>
        </p>
      }
    >
      {error === "google" ? (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-fg"
        >
          Google did not complete that sign-in. Nothing has changed on your
          account — try again, or use your email and password below.
        </p>
      ) : null}

      {isGoogleEnabled() ? (
        <>
          <GoogleButton next={target} />
          <AuthDivider />
        </>
      ) : null}

      <SignInForm next={target} />
    </AuthShell>
  );
}
