import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth/auth-forms";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  AuthDivider,
  GoogleButton,
  GoogleOffNote,
} from "@/components/auth/google-button";
import { isGoogleEnabled } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Create an account",
  description:
    "Create a free Channel Adda account to save listings, send offers and sell your own accounts.",
  alternates: { canonical: "/signup" },
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Already signed in: there is nothing to sign up for. The marketing pages'
  // "Create a free listing" buttons come here with ?next=, and a signed-in
  // seller who pressed one was shown this form — a dead end.
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect(safeNext(next));

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
      <SignUpForm next={typeof next === "string" ? next : undefined} />
    </AuthShell>
  );
}
