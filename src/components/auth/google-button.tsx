"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/**
 * "Continue with Google".
 *
 * Rendered only when the server says the provider is configured, so there is
 * never a button that cannot complete. The failure mode of an unconfigured
 * OAuth provider is a redirect loop on Google's side, which this app cannot
 * catch or explain.
 */
function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="size-4">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function GoogleButton({
  next,
  label = "Continue with Google",
}: {
  /** Where to land afterwards, carried through the OAuth round trip. */
  next?: string;
  label?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await authClient.signIn.social({
              provider: "google",
              callbackURL: next ?? "/dashboard",
              // Somewhere to land that can say what went wrong, rather than
              // Google's own error page.
              errorCallbackURL: "/signin?error=google",
            });
            if (result?.error) {
              setError(
                result.error.message ??
                  "Google sign-in did not complete. Try again, or use your email.",
              );
            }
          });
        }}
      >
        <GoogleMark />
        {pending ? "Opening Google…" : label}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-center text-xs text-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}

/** The "or" rule between Google and the email form. */
export function AuthDivider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
      <span className="text-xs text-subtle">or</span>
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
    </div>
  );
}
