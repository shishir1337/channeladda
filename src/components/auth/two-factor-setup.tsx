"use client";

import {
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  Loader2Icon,
  ShieldCheckIcon,
  SmartphoneIcon,
} from "lucide-react";
import QRCode from "qrcode";
import {
  type ReactNode,
  useEffect,
  useId,
  useState,
  useTransition,
} from "react";
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

/**
 * Better Auth's answer in plain words. Its own messages ("Invalid password",
 * "Invalid code") were shown as they came, and read like a crash.
 */
function plainError(
  error: { code?: string; status?: number } | null | undefined,
  fallback: string,
): string {
  switch (error?.code) {
    case "INVALID_PASSWORD":
      return "That password isn't right. Check it and try again.";
    case "INVALID_CODE":
      return "That code isn't right. The code changes every 30 seconds — type the one your app shows now.";
    case "OTP_HAS_EXPIRED":
      return "That code has run out. Type the one your app shows now.";
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
      return "Too many wrong codes. Wait a minute, then try again.";
  }
  if (error?.status === 429) {
    return "Too many tries just now. Wait a minute, then try again.";
  }
  return fallback;
}

/** The secret key out of the app link, for typing in by hand. */
function secretOf(uri: string): string | null {
  try {
    return new URL(uri).searchParams.get("secret");
  } catch {
    return null;
  }
}

/**
 * The app link as a QR code, drawn in the browser: the secret never goes to
 * a QR service, or anywhere else.
 */
function QrCode({ uri }: { uri: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toString(uri, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((svg) => {
        if (live) {
          setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
        }
      })
      .catch(() => {
        // The key below still works; a missing picture is not a dead end.
      });
    return () => {
      live = false;
    };
  }, [uri]);

  return (
    // Always black on white, in dark mode too: that is what a camera reads.
    <div className="flex size-44 shrink-0 items-center justify-center rounded-lg border border-line bg-white p-2">
      {src ? (
        // biome-ignore lint/performance/noImgElement: a QR code drawn in the browser as a data URL; there is nothing for the image optimiser to do.
        <img
          src={src}
          alt="QR code for your authenticator app"
          width={160}
          height={160}
          className="size-40"
        />
      ) : (
        <Loader2Icon
          aria-hidden="true"
          className="size-5 animate-spin text-neutral-400"
        />
      )}
    </div>
  );
}

/** The secret in groups of four, with a button that copies it whole. */
function SecretKey({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);
  const grouped = secret.match(/.{1,4}/g)?.join(" ") ?? secret;
  return (
    <div className="min-w-0">
      <p className="text-xs leading-relaxed text-muted">
        Can't scan it? Type this key into the app instead.
      </p>
      <p className="mt-1.5 rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-[0.8125rem] leading-relaxed tracking-wide break-words text-fg select-all">
        {grouped}
      </p>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="mt-2"
        onClick={() => {
          navigator.clipboard
            ?.writeText(secret)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            })
            .catch(() => {});
        }}
      >
        {copied ? (
          <CheckIcon aria-hidden="true" />
        ) : (
          <CopyIcon aria-hidden="true" />
        )}
        {copied ? "Copied" : "Copy key"}
      </Button>
      <span role="status" className="sr-only">
        {copied ? "Key copied" : ""}
      </span>
    </div>
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
          as="h2"
          icon={ShieldCheckIcon}
          title="Two-step is on"
          info="Signing in asks for a code from your authenticator app. If you lose the app, one of your backup codes gets you in."
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
                  setError(
                    plainError(
                      result.error,
                      "That didn't work. Try again in a minute.",
                    ),
                  );
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
        <CardHeader
          as="h2"
          icon={KeyRoundIcon}
          title="Save these backup codes now"
        />
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
        as="h2"
        icon={SmartphoneIcon}
        title="Two-step sign-in"
        info="A code from your phone on top of your password, so a stolen password is not enough on its own."
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
                      plainError(
                        result?.error,
                        "Setup didn't start. Try again in a minute.",
                      ),
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
                  Scan this with your authenticator app
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-subtle">
                  Google Authenticator, Microsoft Authenticator, 1Password or
                  any app that shows six-digit codes.
                </p>
                <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
                  <QrCode uri={uri} />
                  {secretOf(uri) ? (
                    <SecretKey secret={secretOf(uri) ?? ""} />
                  ) : null}
                </div>
              </div>
            </li>

            <li className="flex gap-3">
              <StepNumber n={2} />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-6 font-medium text-fg">
                  Type the six-digit code it shows
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
                            plainError(
                              result.error,
                              "That code isn't right. The code changes every 30 seconds — type the one your app shows now.",
                            ),
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
