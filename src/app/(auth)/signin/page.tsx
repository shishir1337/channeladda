import type { Metadata } from "next";
import Link from "next/link";
import { Callout } from "@/components/app/kit";
import { SignInForm } from "@/components/auth/auth-forms";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  AuthDivider,
  GoogleButton,
  GoogleOffNote,
} from "@/components/auth/google-button";
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
            className="font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-fg"
          >
            Create a free account
          </Link>
        </p>
      }
    >
      {error === "google" ? (
        <Callout
          tone="danger"
          role="alert"
          title="Google did not complete that sign-in."
          className="mb-6"
        >
          Nothing has changed on your account — try again, or use your email and
          password below.
        </Callout>
      ) : null}

      {isGoogleEnabled() ? (
        <>
          <GoogleButton next={target} />
          <AuthDivider />
        </>
      ) : (
        <GoogleOffNote />
      )}

      <SignInForm next={target} />
    </AuthShell>
  );
}
