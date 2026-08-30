"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/**
 * Asks for another verification email.
 *
 * Needs the address because the visitor may not be signed in — arriving from a
 * stale link in a different browser is the common case.
 */
export function ResendVerification({ email }: { email?: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">(
    "idle",
  );
  const [address, setAddress] = useState(email ?? "");
  const inputId = "resend-email";

  if (state === "sent") {
    return (
      <output className="mt-6 block text-sm text-verified">
        Sent. If that address has an unverified account, the link is on its way.
      </output>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      {!email ? (
        <div>
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-fg"
          >
            Your email
          </label>
          <input
            id={inputId}
            type="email"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="you@example.com"
            className="mt-2 h-12 w-full rounded-xl border border-line bg-surface-2 px-3.5 text-base text-fg placeholder:text-subtle focus:border-primary/60 focus:outline-none sm:text-[0.9375rem]"
          />
        </div>
      ) : null}

      <Button
        size="md"
        className="self-start"
        disabled={state === "sending" || !address.trim()}
        onClick={async () => {
          setState("sending");
          const { error } = await authClient.sendVerificationEmail({
            email: address.trim(),
            callbackURL: "/verify-email?verified=1",
          });
          setState(error ? "failed" : "sent");
        }}
      >
        {state === "sending" ? "Sending…" : "Resend verification email"}
      </Button>

      {state === "failed" ? (
        <p role="alert" className="text-sm text-danger">
          Could not send it just now. Wait a moment and try again.
        </p>
      ) : null}
    </div>
  );
}
