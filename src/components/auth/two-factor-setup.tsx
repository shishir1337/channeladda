"use client";

import {
  KeyRoundIcon,
  Loader2Icon,
  ShieldCheckIcon,
  SmartphoneIcon,
} from "lucide-react";
import { type ReactNode, useId, useState, useTransition } from "react";
import { Card, CardBody, CardHeader } from "@/components/app/kit";
import { TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/**
 * A button label that holds the button's width while it works: both labels
 * share one grid cell and only one is visible, so the button is as wide as
 * the longer of the two and never jumps when it is pressed.
 */
function BusyLabel({
  pending,
  idle,
  busy,
}: {
  pending: boolean;
  idle: ReactNode;
  busy: ReactNode;
}) {
  return (
    <span className="grid">
      <span
        className={cn(
          "col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5",
          pending && "invisible",
        )}
      >
        {idle}
      </span>
      <span
        className={cn(
          "col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5",
          !pending && "invisible",
        )}
      >
        <Loader2Icon aria-hidden="true" className="animate-spin" />
        {busy}
      </span>
    </span>
  );
}

/** A step's number, so the two moves of enrolment read as a sequence. */
function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-xs font-medium text-muted tabular-nums shadow-xs"
    >
      {n}
    </span>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-3 text-[0.8125rem] text-danger">
      {error}
    </p>
  );
}

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
  /** Issued, but not yet proven to have reached the authenticator. */
  const [pendingCodes, setPendingCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (enabled && !codes) {
    return (
      <Card>
        <CardHeader
          icon={ShieldCheckIcon}
          title="Two-step is on"
          description="Signing in asks for a code from your authenticator app. If you lose the app, one of your backup codes gets you in."
        />
        <CardBody>
          {hasPassword ? (
            <TextField
              id={ids.password}
              name="password"
              type="password"
              label="Your password"
              hint="Needed to turn two-step off."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mb-4 max-w-sm"
            />
          ) : null}

          <Button
            type="button"
            size="md"
            variant="secondary"
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
            <BusyLabel
              pending={pending}
              idle="Turn two-step off"
              busy="Turning off…"
            />
          </Button>
          <ErrorLine error={error} />
        </CardBody>
      </Card>
    );
  }

  if (codes) {
    return (
      <Card>
        <CardHeader icon={KeyRoundIcon} title="Save these backup codes now" />
        <CardBody>
          <p className="max-w-[72ch] text-sm leading-relaxed text-fg">
            They are stored hashed on our side, which means we genuinely cannot
            show them to you again or read them back to you over support. Each
            one works once. Put them somewhere that is not the phone with the
            authenticator on it.
          </p>
          <ul className="mt-4 grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-3">
            {codes.map((backupCode) => (
              <li
                key={backupCode}
                className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-center font-mono text-[0.8125rem] tracking-wide text-fg select-all"
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
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        icon={SmartphoneIcon}
        title="Two-step sign-in"
        description="A code from your phone on top of your password, so a stolen password is not enough on its own."
      />
      <CardBody>
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
                className="mb-4 max-w-sm"
              />
            ) : null}
            <Button
              type="button"
              size="md"
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
                  // Held in component state until the code is confirmed, so
                  // they are never shown to somebody who abandons setup.
                  //
                  // Not sessionStorage: there is no navigation between these
                  // two steps, so writing ten plaintext account-recovery
                  // secrets to a fixed key — readable by any script on the
                  // origin, and left behind entirely if setup is abandoned —
                  // bought nothing at all.
                  setPendingCodes(data.backupCodes ?? []);
                });
              }}
            >
              <BusyLabel
                pending={pending}
                idle="Set up two-step"
                busy="Starting…"
              />
            </Button>
          </>
        ) : (
          <ol className="flex flex-col gap-6">
            <li className="flex gap-3">
              <StepNumber n={1} />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-6 font-medium text-fg">
                  Add this to your authenticator app
                </p>
                <p className="mt-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5 font-mono text-xs leading-relaxed break-all text-muted select-all">
                  {uri}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-subtle">
                  Most apps scan a QR code; most also take this line pasted in.
                  Either way the secret never leaves your device after this.
                </p>
              </div>
            </li>

            <li className="flex gap-3">
              <StepNumber n={2} />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-6 font-medium text-fg">
                  Type the code it shows
                </p>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <TextField
                    id={ids.code}
                    name="code"
                    label="Six-digit code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full max-w-[12rem] [&_input]:tracking-[0.2em] [&_input]:tabular-nums"
                  />
                  <Button
                    type="button"
                    size="md"
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
                        setCodes(pendingCodes);
                        setPendingCodes([]);
                      });
                    }}
                  >
                    <BusyLabel
                      pending={pending}
                      idle="Confirm and turn on"
                      busy="Checking…"
                    />
                  </Button>
                </div>
              </div>
            </li>
          </ol>
        )}

        <ErrorLine error={error} />
      </CardBody>
    </Card>
  );
}
