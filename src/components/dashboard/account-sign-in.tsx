"use client";

import { KeyRoundIcon, LockIcon, MailIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useEffect,
  useId,
  useState,
  useTransition,
} from "react";
import { Card, CardHeader, IconTile } from "@/components/app/kit";
import { PasswordField, TextField } from "@/components/auth/fields";
import { GoogleButton } from "@/components/auth/google-button";
import { BusyLabel } from "@/components/messages/chat-parts";
import { Button } from "@/components/ui/button";
import {
  type EmailErrors,
  MIN_PASSWORD_LENGTH,
  type PasswordErrors,
  parseNewEmail,
  parsePasswordChange,
} from "@/lib/account-security";
import { authClient } from "@/lib/auth-client";
import {
  changePassword,
  confirmEmailChange,
  requestEmailChange,
} from "@/server/actions/account";

type Row = "email" | "password";

/** Where the profile page's "Change" lands, and the address bar after. */
const ANCHOR: Record<Row, string> = {
  email: "change-email",
  password: "change-password",
};

/**
 * Your email and your password, each with a Change that opens its form in
 * place. One card with two rows rather than two more stacked cards: on a
 * phone the security page was already long, and these are the two things
 * people come to it for.
 *
 * Opens on the right form when arrived at by its anchor, so "Change" beside
 * the email on the profile page lands with the form ready.
 */
export function SignInDetails({
  email: savedEmail,
  hasPassword,
  confirmByCode,
  googleEnabled,
}: {
  email: string;
  /** False for an account that only signs in with Google. */
  hasPassword: boolean;
  /** Email confirmation is on: a new address is proved with a code. */
  confirmByCode: boolean;
  googleEnabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Row | null>(null);
  const [email, setEmail] = useState(savedEmail);
  const [done, setDone] = useState<{ row: Row; text: string } | null>(null);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash === ANCHOR.email) setOpen("email");
    else if (hash === ANCHOR.password) setOpen("password");
  }, []);

  function show(row: Row) {
    setDone(null);
    setOpen(row);
  }

  function finish(row: Row, text: string) {
    setOpen(null);
    setDone({ row, text });
    router.refresh();
  }

  return (
    <Card id="sign-in-details" className="scroll-mt-24">
      <CardHeader
        as="h2"
        icon={KeyRoundIcon}
        title="Email and password"
        info="The email is where we send everything about your account. Both are what someone would need to take it over, so changing either one asks you to prove it's you first."
      />
      <ul className="divide-y divide-line">
        <DetailRow
          id={ANCHOR.email}
          icon={MailIcon}
          label="Email"
          value={email}
          open={open === "email"}
          onOpen={() => show("email")}
          done={done?.row === "email" ? done.text : null}
        >
          <EmailForm
            hasPassword={hasPassword}
            confirmByCode={confirmByCode}
            googleEnabled={googleEnabled}
            onCancel={() => setOpen(null)}
            onDone={(next) => {
              setEmail(next);
              finish(
                "email",
                hasPassword
                  ? `Your email is now ${next}. Use it next time you sign in.`
                  : `Your email is now ${next}. You still sign in with Google.`,
              );
            }}
          />
        </DetailRow>

        <DetailRow
          id={ANCHOR.password}
          icon={LockIcon}
          label="Password"
          value={hasPassword ? "Set" : "None. You sign in with Google."}
          action={hasPassword ? "Change" : "Add"}
          actionLabel={hasPassword ? "Change password" : "Add a password"}
          open={open === "password"}
          onOpen={() => show("password")}
          done={done?.row === "password" ? done.text : null}
        >
          {hasPassword ? (
            <PasswordForm
              onCancel={() => setOpen(null)}
              onDone={(text) => finish("password", text)}
            />
          ) : (
            <AddPassword email={email} onCancel={() => setOpen(null)} />
          )}
        </DetailRow>
      </ul>
    </Card>
  );
}

function DetailRow({
  id,
  icon,
  label,
  value,
  action = "Change",
  actionLabel = `Change ${label.toLowerCase()}`,
  open,
  onOpen,
  done,
  children,
}: {
  id: string;
  icon: typeof MailIcon;
  label: string;
  value: string;
  action?: string;
  /** The button's name to a screen reader, when the word alone is vague. */
  actionLabel?: string;
  open: boolean;
  onOpen: () => void;
  /** What just changed, said once under the row. */
  done: string | null;
  children: ReactNode;
}) {
  return (
    <li id={id} className="scroll-mt-24 px-3.5 py-3 sm:px-5">
      <div className="flex items-center gap-3">
        <IconTile icon={icon} />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm leading-5 font-medium text-fg">{label}</h3>
          <p className="truncate text-[0.8125rem] leading-5 text-muted">
            {value}
          </p>
        </div>
        {open ? null : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onOpen}
            aria-label={actionLabel}
          >
            {action}
          </Button>
        )}
      </div>
      {done && !open ? (
        <p
          role="status"
          className="mt-2 text-[0.8125rem] leading-relaxed text-verified"
        >
          {done}
        </p>
      ) : null}
      {open ? (
        <div className="mt-4 animate-app-in sm:pl-11">{children}</div>
      ) : null}
    </li>
  );
}

/** The whole-form failure, below the buttons where the eye already is. */
function FormError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="mt-3 text-[0.8125rem] leading-relaxed text-danger"
    >
      {error}
    </p>
  );
}

/** Same look as the sign-in form's "Forgot password?". */
function ForgotLink() {
  return (
    <Link
      href="/forgot-password"
      className="-my-3 inline-flex min-h-11 items-center rounded-md text-[0.8125rem] text-muted transition-colors hover:text-fg pointer-fine:-my-1 pointer-fine:min-h-6"
    >
      Forgot it?
    </Link>
  );
}

// ---------------------------------------------------------------- email

function EmailForm({
  hasPassword,
  confirmByCode,
  googleEnabled,
  onCancel,
  onDone,
}: {
  hasPassword: boolean;
  confirmByCode: boolean;
  googleEnabled: boolean;
  onCancel: () => void;
  onDone: (email: string) => void;
}) {
  const ids = { email: useId(), password: useId(), code: useId() };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  /** Set once a code is on its way: the address it went to. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [errors, setErrors] = useState<EmailErrors>({});
  const [reauth, setReauth] = useState(false);
  const [pending, startTransition] = useTransition();

  function send() {
    setNote(null);
    setReauth(false);
    // The server checks the same rule against the saved address; this
    // only saves a round trip for a typo.
    const parsed = parseNewEmail(email, "");
    const local: EmailErrors = {};
    if (!parsed.ok) local.email = parsed.error;
    if (hasPassword && !password) {
      local.password = "Enter your current password.";
    }
    setErrors(local);
    if (Object.keys(local).length > 0) return;

    startTransition(async () => {
      const result = await requestEmailChange({ email, password });
      if (!result.ok) {
        setErrors(result.errors);
        setReauth(Boolean(result.reauth));
        return;
      }
      setErrors({});
      if (result.step === "done") {
        onDone(result.email);
        return;
      }
      setSentTo(result.email);
      setCode("");
      setNote(result.message);
    });
  }

  if (sentTo) {
    return (
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setNote(null);
          if (!/^\d{6}$/.test(code.replace(/\s+/g, ""))) {
            setErrors({ code: "Enter the 6-digit code from the email." });
            return;
          }
          startTransition(async () => {
            const result = await confirmEmailChange({ email: sentTo, code });
            if (result.ok) {
              onDone(result.email);
              return;
            }
            setErrors(result.errors);
          });
        }}
      >
        <p className="text-sm leading-relaxed text-fg">
          We sent a 6-digit code to{" "}
          <span className="font-medium break-all">{sentTo}</span>. It expires in
          10 minutes.
        </p>
        <TextField
          id={ids.code}
          name="code"
          label="Code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          error={errors.code ?? errors.email}
          className="mt-4 max-w-[12rem] [&_input]:tracking-[0.2em] [&_input]:tabular-nums"
          required
        />
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button type="submit" size="md" disabled={pending}>
            <BusyLabel busy={pending} idle="Change email" working="Checking…" />
          </Button>
          <Button
            type="button"
            size="md"
            variant="ghost"
            disabled={pending}
            onClick={send}
          >
            Send a new code
          </Button>
          <Button
            type="button"
            size="md"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setSentTo(null);
              setErrors({});
              setNote(null);
            }}
          >
            Use a different email
          </Button>
        </div>
        {note ? (
          <p role="status" className="mt-3 text-[0.8125rem] text-muted">
            {note}
          </p>
        ) : null}
        {/* A new code re-checks the password, whose field is not shown here. */}
        <FormError error={errors.form ?? errors.password} />
      </form>
    );
  }

  return (
    <form
      noValidate
      className="max-w-sm"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <div className="flex flex-col gap-4">
        <TextField
          id={ids.email}
          name="email"
          type="email"
          label="New email"
          hint={
            confirmByCode
              ? "We'll send a code there to check it's yours."
              : hasPassword
                ? "It changes straight away, and you'll sign in with it. Check it's typed right."
                : "It changes straight away. Check it's typed right."
          }
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
          required
        />
        {hasPassword ? (
          <PasswordField
            id={ids.password}
            name="password"
            label="Current password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
            aside={<ForgotLink />}
            required
          />
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button type="submit" size="md" disabled={pending}>
          <BusyLabel
            busy={pending}
            idle={confirmByCode ? "Send code" : "Change email"}
            working={confirmByCode ? "Sending…" : "Changing…"}
          />
        </Button>
        <Button
          type="button"
          size="md"
          variant="ghost"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
      {reauth ? (
        // A step to take, not a failure: said in grey, with the way through
        // right under it. It comes back here with this form open.
        <div className="mt-3">
          <p
            role="status"
            className="text-[0.8125rem] leading-relaxed text-muted"
          >
            {errors.form}
          </p>
          {googleEnabled ? (
            <div className="mt-3">
              <GoogleButton
                next={`/dashboard/security#${ANCHOR.email}`}
                label="Sign in with Google again"
              />
            </div>
          ) : null}
        </div>
      ) : (
        <FormError error={errors.form} />
      )}
    </form>
  );
}

// ------------------------------------------------------------- password

function PasswordForm({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: (message: string) => void;
}) {
  const ids = { current: useId(), next: useId(), confirm: useId() };
  const [fields, setFields] = useState({ current: "", next: "", confirm: "" });
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [pending, startTransition] = useTransition();

  const field =
    (name: keyof typeof fields) => (event: { target: { value: string } }) =>
      setFields((current) => ({ ...current, [name]: event.target.value }));

  return (
    <form
      noValidate
      className="max-w-sm"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = parsePasswordChange(fields);
        if (!parsed.ok) {
          setErrors(parsed.errors);
          return;
        }
        setErrors({});
        startTransition(async () => {
          const result = await changePassword(fields);
          if (result.ok) {
            onDone(result.message);
            return;
          }
          setErrors(result.errors);
        });
      }}
    >
      <div className="flex flex-col gap-4">
        <PasswordField
          id={ids.current}
          name="current"
          label="Current password"
          autoComplete="current-password"
          value={fields.current}
          onChange={field("current")}
          error={errors.current}
          aside={<ForgotLink />}
          required
        />
        <PasswordField
          id={ids.next}
          name="next"
          label="New password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters. One you don't use anywhere else.`}
          autoComplete="new-password"
          value={fields.next}
          onChange={field("next")}
          error={errors.next}
          required
        />
        <PasswordField
          id={ids.confirm}
          name="confirm"
          label="New password again"
          autoComplete="new-password"
          value={fields.confirm}
          onChange={field("confirm")}
          error={errors.confirm}
          required
        />
      </div>

      {/* Said before, not after: being signed out of a phone you did not
          expect to be is its own small scare. */}
      <p className="mt-4 text-[0.8125rem] leading-relaxed text-muted">
        You'll stay signed in here. Your other devices will be signed out.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="submit" size="md" disabled={pending}>
          <BusyLabel
            busy={pending}
            idle="Change password"
            working="Changing…"
          />
        </Button>
        <Button
          type="button"
          size="md"
          variant="ghost"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
      <FormError error={errors.form} />
    </form>
  );
}

/**
 * A Google-only account has no password. One can be added through the
 * reset link — Better Auth creates the password when the link is used — so
 * it takes the inbox to add one, not just this session.
 */
function AddPassword({
  email,
  onCancel,
}: {
  email: string;
  onCancel: () => void;
}) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <p role="status" className="text-sm leading-relaxed text-fg">
        Check your inbox at{" "}
        <span className="font-medium break-all">{email}</span>. The link works
        once and expires in an hour.
      </p>
    );
  }

  return (
    <div className="max-w-md">
      <p className="text-sm leading-relaxed text-fg">
        You sign in with Google, so there's no password to change. To sign in
        with your email too, we'll email you a link to set a password.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="md"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await authClient.requestPasswordReset({
                email,
                redirectTo: "/reset-password",
              });
              if (result.error) {
                setError(
                  result.error.status === 429
                    ? "Too many tries just now. Wait a minute and try again."
                    : "We couldn't send the link. Try again in a minute.",
                );
                return;
              }
              setSent(true);
            });
          }}
        >
          <BusyLabel busy={pending} idle="Email me a link" working="Sending…" />
        </Button>
        <Button
          type="button"
          size="md"
          variant="ghost"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
      <FormError error={error ?? undefined} />
    </div>
  );
}
