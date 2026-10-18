"use client";

import { useState } from "react";
import { inputClass, labelClass } from "@/components/app/kit";
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
      <output className="mt-5 block text-sm text-verified">
        Sent. If that address has an unverified account, the link is on its way.
      </output>
    );
  }

  return (
    <div className="mt-5 flex flex-col gap-3">
      {!email ? (
        <div>
          <label htmlFor={inputId} className={labelClass}>
            Your email
          </label>
          <input
            id={inputId}
            type="email"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="you@example.com"
            className={`mt-1.5 ${inputClass}`}
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
        <p role="alert" className="text-[0.8125rem] text-danger">
          Could not send it just now. Wait a moment and try again.
        </p>
      ) : null}
    </div>
  );
}
