"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

function messageFor(error: { code?: string; status?: number }): string {
  if (error.status === 429) {
    return "Too many tries just now. Wait a minute and try again.";
  }
  switch (error.code) {
    case "INVALID_OTP":
      return "That code is not right. Use the one in the newest email — each new code replaces the last.";
    case "OTP_EXPIRED":
      return "That code has expired. Send a new one below.";
    case "TOO_MANY_ATTEMPTS":
      return "Too many wrong tries for that code. Send a new one below.";
    default:
      return "Could not check the code just now. Try again in a moment.";
  }
}

/**
 * Confirms the address with the six-digit code from the sign-up email, and
 * sends a fresh one when it is lost or expired.
 *
 * Takes the address when the visitor is signed in. Otherwise it asks for
 * it: someone who signed up on a laptop can still confirm from a phone.
 */
export function VerifyEmailForm({ email }: { email?: string }) {
  const router = useRouter();
  const ids = { email: useId(), code: useId() };
  const [address, setAddress] = useState(email ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState<"idle" | "sending" | "sent">("idle");
  const [pending, startTransition] = useTransition();

  const target = address.trim();
  const otp = code.replace(/\D/g, "");

  return (
    <form
      noValidate
      className="mt-5 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const { error: failed } = await authClient.emailOtp.verifyEmail({
            email: target,
            otp,
          });
          if (failed) {
            setError(messageFor(failed));
            return;
          }
          router.replace("/verify-email?verified=1");
          router.refresh();
        });
      }}
    >
      {!email ? (
        <TextField
          id={ids.email}
          name="email"
          type="email"
          label="Your email"
          autoComplete="email"
          placeholder="you@example.com"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
        />
      ) : null}

      <TextField
        id={ids.code}
        name="code"
        label="Six-digit code"
        hint="From the email we just sent. It expires in 10 minutes."
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        placeholder="123456"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        error={error ?? undefined}
        required
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          size="md"
          disabled={pending || otp.length !== 6 || !target}
        >
          {pending ? "Checking…" : "Confirm email"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="md"
          disabled={resent === "sending" || !target}
          onClick={async () => {
            setError(null);
            setResent("sending");
            const { error: failed } =
              await authClient.emailOtp.sendVerificationOtp({
                email: target,
                type: "email-verification",
              });
            if (failed) {
              setResent("idle");
              setError(
                failed.status === 429
                  ? "Too many codes asked for just now. Wait a minute and try again."
                  : "Could not send a code just now. Wait a moment and try again.",
              );
              return;
            }
            setCode("");
            setResent("sent");
          }}
        >
          {resent === "sending" ? "Sending…" : "Send a new code"}
        </Button>
      </div>

      {resent === "sent" ? (
        <output className="block text-[0.8125rem] text-verified">
          Sent. If that address has an account waiting to be confirmed, a new
          code is on its way and the old one no longer works.
        </output>
      ) : null}
    </form>
  );
}
