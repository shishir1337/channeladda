"use client";

import {
  CheckCircle2Icon,
  CopyIcon,
  LinkIcon,
  TriangleAlertIcon,
  UserPlusIcon,
} from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";
import { Panel } from "@/components/admin/console";
import { TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { inviteTeammate, revokeInvite } from "@/server/actions/admin-users";

/**
 * Hiring somebody, from a screen.
 *
 * Until this existed the only way to create an account with a role was
 * `scripts/create-admin.ts` — a terminal, an `.env` and a developer. For a
 * marketplace whose whole product runs on agents taking custody of channels,
 * "you cannot hire an agent without an engineer" is not a missing feature so
 * much as a missing business.
 *
 * It invites rather than issuing a password. Nobody types a password on
 * somebody else's behalf, so nobody but the account holder has ever known it —
 * which is what keeps "who sent that payout" answerable. The link is shown
 * once, held in this component's state and nowhere else: the server keeps only
 * a fingerprint of the token and cannot produce it again.
 */

/** Grave enough to want a red confirmation rather than a neutral one. */
const GRAVE: readonly UserRole[] = ["FINANCE", "SUPERADMIN"];

export function InviteTeammate({
  roles,
  labels,
  blurbs,
  consequences,
}: {
  roles: readonly UserRole[];
  labels: Record<string, string>;
  blurbs: Record<string, string>;
  consequences: Record<string, string>;
}) {
  const emailId = useId();
  const linkId = useId();
  const linkRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>(roles[0] ?? "AGENT");
  const [armed, setArmed] = useState(false);
  const [issued, setIssued] = useState<{
    link: string;
    email: string;
    message: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ready = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const grave = GRAVE.includes(role);

  if (issued) {
    return (
      <Panel tone="verified" padded={false} className="p-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-display text-sm font-bold text-fg">
          <CheckCircle2Icon
            aria-hidden="true"
            className="size-4 shrink-0 text-verified"
          />
          {issued.message}
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          Send this link to {issued.email} yourself — a message, a call, however
          you normally reach them. They choose their own password on it, so you
          never hold one for them.
        </p>

        <label
          htmlFor={linkId}
          className="mt-3.5 block text-xs font-medium text-fg"
        >
          Invitation link
        </label>
        <div className="mt-1.5 flex flex-wrap items-stretch gap-2">
          <input
            ref={linkRef}
            id={linkId}
            readOnly
            value={issued.link}
            // Selects the whole thing on focus, because this is the one field
            // on the platform where a partial copy fails silently.
            onFocus={(event) => event.currentTarget.select()}
            className="tnum min-w-56 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-xs text-fg focus:border-primary/60 focus:outline-none"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(issued.link);
                setCopied(true);
              } catch {
                // No clipboard permission, or an insecure origin. The field is
                // right there and selects itself, so say so rather than
                // failing with nothing on screen.
                linkRef.current?.focus();
                setCopied(false);
              }
            }}
          >
            {copied ? (
              <CheckCircle2Icon aria-hidden="true" />
            ) : (
              <CopyIcon aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed font-medium text-fg">
          <TriangleAlertIcon
            aria-hidden="true"
            className="mt-px size-3.5 shrink-0 text-danger"
          />
          <span>
            This is the only time it is shown. We store a fingerprint of it, not
            the link, so nobody — including us — can read it back. If it goes
            astray, invite the address again: the old link stops working the
            moment you do. It expires in 72 hours and works once.
          </span>
        </p>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="mt-3"
          onClick={() => {
            setIssued(null);
            setCopied(false);
            setEmail("");
            setArmed(false);
          }}
        >
          Invite somebody else
        </Button>
      </Panel>
    );
  }

  return (
    <Panel padded={false} className="p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-display text-sm font-bold text-fg">
        <UserPlusIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-subtle"
        />
        Add a teammate
      </h2>
      <p className="mt-1.5 max-w-[68ch] text-xs leading-relaxed text-muted">
        Creates nothing yet. You get a one-time link to hand over; the account
        exists once they have used it and set their own password. No password is
        ever shared or emailed.
      </p>

      <div className="mt-3.5 grid gap-3.5 lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-start">
        <TextField
          id={emailId}
          name="email"
          type="email"
          label="Their email address"
          hint="Where you would reach them. Nothing is sent to it."
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setArmed(false);
            setError(null);
          }}
          placeholder="name@channeladda.com"
          autoComplete="off"
          required
        />

        <fieldset disabled={pending || armed} className="min-w-0">
          <legend className="text-sm font-medium text-fg">Their role</legend>
          <div className="mt-2 grid gap-2">
            {roles.map((option) => (
              <label
                key={option}
                className={cn(
                  "flex items-start gap-2.5 rounded-card border p-2.5 transition-colors",
                  armed ? "cursor-default" : "cursor-pointer",
                  role === option
                    ? "border-primary bg-primary-soft"
                    : "border-line hover:bg-surface-2",
                )}
              >
                <input
                  type="radio"
                  name="invite-role"
                  value={option}
                  checked={role === option}
                  onChange={() => {
                    setRole(option);
                    setError(null);
                  }}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fg">
                    {labels[option]}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-subtle">
                    {blurbs[option]}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div
        className={cn(
          "mt-3.5 rounded-card border p-3",
          grave
            ? "border-danger/40 bg-danger-soft"
            : "border-line bg-surface-2",
        )}
      >
        <p className="flex items-start gap-2 text-xs leading-relaxed text-fg">
          {grave ? (
            <TriangleAlertIcon
              aria-hidden="true"
              className="mt-px size-3.5 shrink-0 text-danger"
            />
          ) : (
            <LinkIcon
              aria-hidden="true"
              className="mt-px size-3.5 shrink-0 text-subtle"
            />
          )}
          <span>
            <strong className="font-semibold">
              Whoever opens this link becomes {labels[role].toLowerCase()}:
            </strong>{" "}
            {consequences[role]}
          </span>
        </p>
      </div>

      {armed ? (
        <div
          className={cn(
            "mt-3 rounded-card border p-3",
            grave
              ? "border-danger/40 bg-danger-soft"
              : "border-primary/40 bg-primary-soft",
          )}
        >
          <p className="text-xs leading-relaxed font-medium text-fg">
            Invite <strong className="font-semibold">{email.trim()}</strong> as{" "}
            {labels[role].toLowerCase()}? The link works once, expires in 72
            hours, and you can withdraw it until it is used.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={grave ? "danger" : "primary"}
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await inviteTeammate(email.trim(), role);
                  if (!result.ok) {
                    setError(result.error);
                    setArmed(false);
                    return;
                  }
                  setIssued({
                    link: result.link,
                    email: result.email,
                    message: result.message,
                  });
                });
              }}
            >
              {pending ? "Creating the link…" : "Yes — create the link"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setArmed(false)}
            >
              Back
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant={grave ? "outline" : "primary"}
          className="mt-3"
          disabled={pending || !ready}
          onClick={() => {
            setError(null);
            setArmed(true);
          }}
        >
          Continue
        </Button>
      )}

      {!ready && email.trim().length > 0 ? (
        <p className="mt-2 text-xs text-subtle">
          That does not look like an email address yet.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-danger"
        >
          <TriangleAlertIcon
            aria-hidden="true"
            className="mt-px size-3.5 shrink-0"
          />
          <span>{error}</span>
        </p>
      ) : null}
    </Panel>
  );
}

/**
 * Withdrawing an invitation that is still outstanding.
 *
 * Asks twice like everything else that cannot be undone — the link cannot be
 * brought back, only reissued — and the confirmation names the address, because
 * a row of identical buttons down a list is how the wrong one gets pressed.
 */
export function RevokeInvite({
  inviteId,
  email,
}: {
  inviteId: string;
  email: string;
}) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (error) {
    return (
      <p role="alert" className="text-xs leading-relaxed text-danger">
        {error}
      </p>
    );
  }

  if (!armed) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setArmed(true)}
      >
        Withdraw
        <span className="sr-only"> the invitation for {email}</span>
      </Button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-xs break-all text-muted">
        Kill the link for {email}?
      </span>
      <Button
        type="button"
        size="sm"
        variant="danger"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await revokeInvite(inviteId);
            if (!result.ok) setError(result.error);
          });
        }}
      >
        {pending ? "Withdrawing…" : "Yes"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => setArmed(false)}
      >
        No
      </Button>
    </span>
  );
}
