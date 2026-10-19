"use client";

import { CheckCircle2Icon } from "lucide-react";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { FormNotice, PasswordField, TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { acceptInvite } from "@/server/actions/admin-users";

/**
 * Setting up a staff account from an invitation.
 *
 * The password is chosen here and posted straight to the server action, which
 * hashes it the way Better Auth does and never writes it anywhere else. The
 * platform does not generate one, show one, or hold one — which is the whole
 * reason this screen exists rather than a superadmin reading a password down
 * the phone.
 *
 * The email is fixed by the invitation and shown read-only: letting it be
 * edited would turn an invitation for one address into an account on any.
 */
export function AcceptInviteForm({
  token,
  email,
  roleLabel,
  minPassword,
}: {
  token: string;
  email: string;
  roleLabel: string;
  minPassword: number;
}) {
  const emailId = useId();
  const nameId = useId();
  const pwId = useId();
  const confirmId = useId();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    password?: string;
    confirm?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="rounded-panel border border-verified/30 bg-verified-soft p-6">
        <span className="flex size-12 items-center justify-center rounded-xl bg-surface text-verified">
          <CheckCircle2Icon aria-hidden="true" className="size-6" />
        </span>
        <h2 className="mt-5 text-lg font-semibold">Your account is ready</h2>
        <p className="mt-2.5 text-sm leading-relaxed text-muted">
          You are {roleLabel.toLowerCase()} on Channel Adda. Sign in with{" "}
          {email} and the password you just chose. Turn on two-factor under
          Security once you are in — a staff account is worth it.
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
      onSubmit={(event) => {
        event.preventDefault();

        const errors: typeof fieldErrors = {};
        if (name.trim().length < 2) {
          errors.name = "Enter the name your colleagues will see.";
        }
        if (password.length < minPassword) {
          errors.password = `Use at least ${minPassword} characters — this account can move money or appoint staff.`;
        }
        if (password !== confirm) {
          errors.confirm = "The two passwords do not match.";
        }

        setFieldErrors(errors);
        setFormError(null);
        if (Object.keys(errors).length > 0) return;

        startTransition(async () => {
          const result = await acceptInvite(token, name.trim(), password);
          if (!result.ok) {
            setFormError(result.error);
            return;
          }
          // Cleared before the success panel replaces the form, so a chosen
          // password is not left sitting in component state behind it.
          setPassword("");
          setConfirm("");
          setDone(true);
        });
      }}
    >
      {formError ? <FormNotice>{formError}</FormNotice> : null}

      <div className="flex flex-col gap-5">
        <TextField
          id={emailId}
          name="email"
          type="email"
          label="Your email address"
          hint="Set by the invitation. This is the address you will sign in with."
          value={email}
          readOnly
          autoComplete="username"
        />
        <TextField
          id={nameId}
          name="name"
          label="Your name"
          hint="Shown beside everything you do — approvals, payouts, transfers."
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Priya Raman"
          autoComplete="name"
          error={fieldErrors.name}
          required
        />
        <PasswordField
          id={pwId}
          name="password"
          label="Choose a password"
          hint={`At least ${minPassword} characters, and not one you use anywhere else.`}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••••••"
          autoComplete="new-password"
          error={fieldErrors.password}
          required
        />
        <PasswordField
          id={confirmId}
          name="confirm"
          label="Confirm your password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder="••••••••••••"
          autoComplete="new-password"
          error={fieldErrors.confirm}
          required
        />
      </div>

      <Button
        type="submit"
        size="lg"
        className="mt-7 w-full"
        disabled={pending}
      >
        {pending ? "Creating your account…" : "Create my account"}
      </Button>
    </form>
  );
}
