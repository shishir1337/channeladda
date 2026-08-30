"use client";

import { CheckCircle2Icon, MailCheckIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { FormNotice, PasswordField, TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { authClient, signIn, signUp } from "@/lib/auth-client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Matches `MIN_PASSWORD_LENGTH` in the auth config. */
const MIN_PASSWORD = 10;

type Errors = Record<string, string>;

/**
 * Turns a Better Auth failure into something worth reading.
 *
 * Sign-in deliberately never distinguishes "no such account" from "wrong
 * password" — that difference is how an attacker learns which addresses are
 * registered.
 */
function messageFor(code: string | undefined, fallback: string) {
  switch (code) {
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_PASSWORD":
    case "USER_NOT_FOUND":
      return "That email and password do not match an account.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "An account already exists for that email. Try signing in instead.";
    case "PASSWORD_TOO_SHORT":
      return `Use at least ${MIN_PASSWORD} characters.`;
    case "EMAIL_NOT_VERIFIED":
      return "Confirm your email address before signing in. Check your inbox for the link.";
    case "INVALID_TOKEN":
    case "TOKEN_EXPIRED":
      return "That link has expired. Request a new one and try again.";
    default:
      return fallback;
  }
}

export function SignInForm({ next }: { next?: string }) {
  const emailId = useId();
  const pwId = useId();
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const nextErrors: Errors = {};
        const email = String(data.get("email") ?? "").trim();
        const password = String(data.get("password") ?? "");

        if (!email) nextErrors.email = "Enter your email address.";
        else if (!EMAIL_RE.test(email))
          nextErrors.email = "That email does not look right.";
        if (!password) nextErrors.password = "Enter your password.";

        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        setPending(true);
        const { error } = await signIn.email({ email, password });
        if (error) {
          setErrors({
            form: messageFor(error.code, "Could not sign you in. Try again."),
          });
          setPending(false);
          return;
        }

        // `refresh` so server components pick up the new session cookie.
        router.push(next?.startsWith("/") ? next : "/");
        router.refresh();
      }}
    >
      {errors.form ? <FormNotice>{errors.form}</FormNotice> : null}

      <div className="flex flex-col gap-5">
        <TextField
          id={emailId}
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email}
          required
        />
        <div>
          <PasswordField
            id={pwId}
            name="password"
            label="Password"
            autoComplete="current-password"
            placeholder="••••••••"
            error={errors.password}
            required
          />
          <Link
            href="/forgot-password"
            className="mt-2 inline-flex min-h-9 items-center text-sm text-primary-text underline-offset-4 hover:underline"
          >
            Forgot your password?
          </Link>
        </div>
      </div>

      <Button
        type="submit"
        size="lg"
        className="mt-7 w-full"
        disabled={pending}
      >
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export function SignUpForm() {
  const nameId = useId();
  const emailId = useId();
  const pwId = useId();
  const termsId = useId();
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const nextErrors: Errors = {};
        const name = String(data.get("name") ?? "").trim();
        const email = String(data.get("email") ?? "").trim();
        const password = String(data.get("password") ?? "");

        if (!name) nextErrors.name = "Enter the name buyers should see.";
        if (!email) nextErrors.email = "Enter your email address.";
        else if (!EMAIL_RE.test(email))
          nextErrors.email = "That email does not look right.";

        if (password.length < MIN_PASSWORD)
          nextErrors.password = `Use at least ${MIN_PASSWORD} characters — this account will hold money.`;

        if (!data.get("terms"))
          nextErrors.terms =
            "You need to accept the terms before creating an account.";

        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        setPending(true);
        const { error } = await signUp.email({ name, email, password });
        if (error) {
          setErrors({
            form: messageFor(
              error.code,
              "Could not create the account. Try again.",
            ),
          });
          setPending(false);
          return;
        }

        router.push("/verify-email");
        router.refresh();
      }}
    >
      {errors.form ? <FormNotice>{errors.form}</FormNotice> : null}

      <div className="flex flex-col gap-5">
        <TextField
          id={nameId}
          name="name"
          type="text"
          label="Name"
          hint="Shown on your listings and reviews. A business name is fine."
          autoComplete="name"
          placeholder="Alex Whitfield"
          error={errors.name}
          required
        />
        <TextField
          id={emailId}
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email}
          required
        />
        <PasswordField
          id={pwId}
          name="password"
          label="Password"
          hint={`At least ${MIN_PASSWORD} characters. Two-factor can be added later in settings.`}
          autoComplete="new-password"
          placeholder="••••••••"
          error={errors.password}
          required
        />

        <div>
          <label
            htmlFor={termsId}
            className="flex cursor-pointer items-start gap-3 text-sm text-muted"
          >
            <input
              id={termsId}
              name="terms"
              type="checkbox"
              aria-invalid={Boolean(errors.terms)}
              aria-describedby={errors.terms ? `${termsId}-error` : undefined}
              className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
            />
            <span>
              I agree to the{" "}
              <Link
                href="/terms"
                className="text-primary-text underline-offset-4 hover:underline"
              >
                terms of service
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="text-primary-text underline-offset-4 hover:underline"
              >
                privacy policy
              </Link>
              .
            </span>
          </label>
          {errors.terms ? (
            <p
              id={`${termsId}-error`}
              role="alert"
              className="mt-2 text-sm text-danger"
            >
              {errors.terms}
            </p>
          ) : null}
        </div>
      </div>

      <Button
        type="submit"
        size="lg"
        className="mt-7 w-full"
        disabled={pending}
      >
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="mt-3 text-center text-xs text-subtle">
        No documents needed. Identity checks only apply before a seller&apos;s
        first listing goes live.
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const emailId = useId();
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (sentTo) {
    return (
      <div className="rounded-panel border border-verified/30 bg-verified-soft p-6">
        <span className="flex size-12 items-center justify-center rounded-xl bg-surface text-verified">
          <MailCheckIcon aria-hidden="true" className="size-6" />
        </span>
        <h2 className="mt-5 font-display text-lg font-bold">
          Check your inbox
        </h2>
        <p className="mt-2.5 text-sm leading-relaxed text-muted">
          If an account exists for{" "}
          <span className="font-medium text-fg">{sentTo}</span>, a reset link is
          on its way. It expires in one hour.
        </p>
        <Button
          variant="secondary"
          size="md"
          className="mt-6"
          onClick={() => setSentTo(null)}
        >
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const email = String(
          new FormData(e.currentTarget).get("email") ?? "",
        ).trim();
        if (!email) {
          setErrors({ email: "Enter your email address." });
          return;
        }
        if (!EMAIL_RE.test(email)) {
          setErrors({ email: "That email does not look right." });
          return;
        }

        setErrors({});
        setPending(true);
        await authClient.requestPasswordReset({
          email,
          redirectTo: "/reset-password",
        });
        // Always the same response, whether or not the account exists — this
        // endpoint must not be usable to discover registered addresses.
        setPending(false);
        setSentTo(email);
      }}
    >
      <TextField
        id={emailId}
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        placeholder="you@example.com"
        error={errors.email}
        required
      />
      <Button
        type="submit"
        size="lg"
        className="mt-7 w-full"
        disabled={pending}
      >
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token?: string }) {
  const pwId = useId();
  const confirmId = useId();
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <FormNotice>
        This link is missing its reset token, so it cannot be used. Request a
        fresh one from the forgotten-password page.
      </FormNotice>
    );
  }

  if (done) {
    return (
      <div className="rounded-panel border border-verified/30 bg-verified-soft p-6">
        <span className="flex size-12 items-center justify-center rounded-xl bg-surface text-verified">
          <CheckCircle2Icon aria-hidden="true" className="size-6" />
        </span>
        <h2 className="mt-5 font-display text-lg font-bold">
          Password updated
        </h2>
        <p className="mt-2.5 text-sm leading-relaxed text-muted">
          Every other session has been signed out.
        </p>
        <Button asChild size="md" className="mt-6">
          <Link href="/signin">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const pw = String(data.get("password") ?? "");
        const confirm = String(data.get("confirm") ?? "");
        const nextErrors: Errors = {};

        if (pw.length < MIN_PASSWORD)
          nextErrors.password = `Use at least ${MIN_PASSWORD} characters — this account will hold money.`;
        if (pw !== confirm)
          nextErrors.confirm = "The two passwords do not match.";

        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) return;

        setPending(true);
        const { error } = await authClient.resetPassword({
          newPassword: pw,
          token,
        });
        if (error) {
          setErrors({
            form: messageFor(
              error.code,
              "Could not update the password. Try again.",
            ),
          });
          setPending(false);
          return;
        }
        setDone(true);
      }}
    >
      {errors.form ? <FormNotice>{errors.form}</FormNotice> : null}
      <div className="flex flex-col gap-5">
        <PasswordField
          id={pwId}
          name="password"
          label="New password"
          hint={`At least ${MIN_PASSWORD} characters.`}
          autoComplete="new-password"
          placeholder="••••••••"
          error={errors.password}
          required
        />
        <PasswordField
          id={confirmId}
          name="confirm"
          label="Confirm new password"
          autoComplete="new-password"
          placeholder="••••••••"
          error={errors.confirm}
          required
        />
      </div>
      <Button
        type="submit"
        size="lg"
        className="mt-7 w-full"
        disabled={pending}
      >
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
