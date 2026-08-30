import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "@/components/auth/auth-forms";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to your Channel Adda account to manage listings, offers and orders.",
  alternates: { canonical: "/signin" },
};

export default async function SignInPage({
  searchParams,
}: PageProps<"/signin">) {
  const { next } = await searchParams;
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
      <SignInForm next={typeof next === "string" ? next : undefined} />
    </AuthShell>
  );
}
