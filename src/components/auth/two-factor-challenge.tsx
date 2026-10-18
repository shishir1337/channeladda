"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "@/lib/safe-next";

export function TwoFactorChallenge({ next }: { next: string }) {
  const router = useRouter();
  const ids = { code: useId(), backup: useId() };
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const backup = mode === "backup";

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const trimmed = code.replace(/\s+/g, "");
      const result = backup
        ? await authClient.twoFactor.verifyBackupCode({ code: trimmed })
        : await authClient.twoFactor.verifyTotp({
            code: trimmed,
            trustDevice: trust,
          });

      if (result?.error) {
        setError(
          result.error.message ??
            (backup
              ? "That backup code is not valid, or has already been used."
              : "That code is not right. Codes change every 30 seconds — check you are reading the current one."),
        );
        return;
      }
      router.push(safeNext(next));
      router.refresh();
    });
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <TextField
        id={backup ? ids.backup : ids.code}
        name={backup ? "backupCode" : "code"}
        label={backup ? "Backup code" : "Six-digit code"}
        hint={
          backup
            ? "One of the codes you saved when you turned this on. Each works once."
            : "From your authenticator app."
        }
        inputMode={backup ? "text" : "numeric"}
        autoComplete={backup ? "one-time-code" : "one-time-code"}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        required
      />

      {!backup ? (
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-muted">
          <input
            type="checkbox"
            checked={trust}
            onChange={(e) => setTrust(e.target.checked)}
            className="mt-0.5 size-4 cursor-pointer rounded border-line"
          />
          <span>
            Trust this device for 30 days.{" "}
            <span className="text-subtle">
              Only on a device that is yours alone.
            </span>
          </span>
        </label>
      ) : null}

      <Button type="submit" size="lg" disabled={pending || !code.trim()}>
        {pending ? "Checking…" : "Verify and sign in"}
      </Button>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => {
          setMode(backup ? "totp" : "backup");
          setCode("");
          setError(null);
        }}
        className="cursor-pointer text-center text-xs text-subtle underline transition-colors duration-200 hover:text-fg"
      >
        {backup
          ? "Use my authenticator app instead"
          : "I cannot reach my authenticator — use a backup code"}
      </button>
    </form>
  );
}
