"use client";

import { useId, useState, useTransition } from "react";
import { TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/**
 * Turning two-step on, and off again.
 *
 * The backup codes are shown once and never again — the server stores them
 * hashed, so there is no "show me them again" to build. That makes this screen
 * the only chance to keep them, and it says so as plainly as it can without
 * nagging.
 *
 * Enrolment is deliberately two moves: a secret is issued, and then a code
 * from the app confirms the secret actually reached it. Skipping the
 * confirmation is how people lock themselves out of accounts.
 */
export function TwoFactorSetup({
  enabled,
  hasPassword,
}: {
  enabled: boolean;
  /** Google-only accounts have none, and are not asked for one. */
  hasPassword: boolean;
}) {
  const ids = { password: useId(), code: useId() };
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [uri, setUri] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (enabled && !codes) {
    return (
      <div className="rounded-panel border border-verified/30 bg-verified-soft p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-fg">
          Two-step is on
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Signing in asks for a code from your authenticator app. If you lose
          the app, one of your backup codes gets you in.
        </p>

        {hasPassword ? (
          <TextField
            id={ids.password}
            name="password"
            type="password"
            label="Your password"
            hint="Needed to turn two-step off."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-4 max-w-sm"
          />
        ) : null}

        <Button
          type="button"
          size="md"
          variant="secondary"
          className="mt-4"
          disabled={pending || (hasPassword && !password)}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await authClient.twoFactor.disable({ password });
              if (result?.error) {
                setError(result.error.message ?? "That did not work.");
                return;
              }
              window.location.reload();
            });
          }}
        >
          {pending ? "Turning off…" : "Turn two-step off"}
        </Button>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (codes) {
    return (
      <div className="rounded-panel border border-primary/30 bg-primary-soft p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-fg">
          Save these backup codes now
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          They are stored hashed on our side, which means we genuinely cannot
          show them to you again or read them back to you over support. Each one
          works once. Put them somewhere that is not the phone with the
          authenticator on it.
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-3">
          {codes.map((backupCode) => (
            <li
              key={backupCode}
              className="rounded-card border border-line bg-surface px-3 py-2 text-center text-fg"
            >
              {backupCode}
            </li>
          ))}
        </ul>
        <Button
          type="button"
          size="md"
          className="mt-5"
          onClick={() => {
            navigator.clipboard?.writeText(codes.join("\n")).catch(() => {});
            window.location.reload();
          }}
        >
          Copy them and finish
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-panel border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold text-fg">
        Two-step sign-in
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        A code from your phone on top of your password. On a marketplace where
        an account can authorise a channel transfer, a stolen password should
        not be enough on its own.
      </p>

      {!uri ? (
        <>
          {hasPassword ? (
            <TextField
              id={ids.password}
              name="password"
              type="password"
              label="Your password"
              hint="Confirms it is you turning this on."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-4 max-w-sm"
            />
          ) : null}
          <Button
            type="button"
            size="md"
            className="mt-4"
            disabled={pending || (hasPassword && !password)}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await authClient.twoFactor.enable({
                  password,
                  method: "totp",
                });
                if (result?.error || !result?.data) {
                  setError(
                    result?.error?.message ??
                      "Could not start setup. Check your password.",
                  );
                  return;
                }
                const data = result.data as {
                  totpURI?: string;
                  backupCodes?: string[];
                };
                setUri(data.totpURI ?? null);
                // Held until the code is confirmed, so they are not shown to
                // somebody who abandons setup half way.
                if (data.backupCodes) setCodes(null);
                sessionStorage.setItem(
                  "ca-2fa-codes",
                  JSON.stringify(data.backupCodes ?? []),
                );
              });
            }}
          >
            {pending ? "Starting…" : "Set up two-step"}
          </Button>
        </>
      ) : (
        <>
          <p className="mt-4 text-sm font-medium text-fg">
            1. Add this to your authenticator app
          </p>
          <p className="mt-2 rounded-card border border-line bg-surface-2 p-3 font-mono text-[0.6875rem] break-all text-muted">
            {uri}
          </p>
          <p className="mt-1.5 text-xs text-subtle">
            Most apps scan a QR code; most also take this line pasted in. Either
            way the secret never leaves your device after this.
          </p>

          <p className="mt-5 text-sm font-medium text-fg">
            2. Type the code it shows
          </p>
          <TextField
            id={ids.code}
            name="code"
            label="Six-digit code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-2 max-w-xs"
          />
          <Button
            type="button"
            size="md"
            className="mt-4"
            disabled={pending || code.trim().length < 6}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await authClient.twoFactor.verifyTotp({
                  code: code.replace(/\s+/g, ""),
                });
                if (result?.error) {
                  setError(
                    result.error.message ??
                      "That code is not right. They change every 30 seconds.",
                  );
                  return;
                }
                // Confirmed, so the codes are now worth showing.
                const stored = sessionStorage.getItem("ca-2fa-codes");
                sessionStorage.removeItem("ca-2fa-codes");
                setCodes(stored ? (JSON.parse(stored) as string[]) : []);
                setDone(true);
              });
            }}
          >
            {pending ? "Checking…" : "Confirm and turn on"}
          </Button>
        </>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {done ? null : null}
    </div>
  );
}
