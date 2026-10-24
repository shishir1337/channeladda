"use client";

import {
  CheckCircle2Icon,
  CircleAlertIcon,
  CopyIcon,
  LinkIcon,
  TriangleAlertIcon,
  UserPlusIcon,
} from "lucide-react";
import { type ReactNode, useId, useRef, useState, useTransition } from "react";
import { Card, CardBody, CardHeader, inputClass } from "@/components/app/kit";
import { TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { iconText } from "@/components/ui/icon-hue";
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

const WELL = {
  neutral: "border-line bg-surface-2/60",
  warning: "border-primary/30 bg-primary-soft/70",
  danger: "border-danger/25 bg-danger-soft/70",
} as const;

/** A consequence or a confirmation, inset in the card rather than a card. */
function Well({
  tone = "neutral",
  className,
  children,
}: {
  tone?: keyof typeof WELL;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 text-[0.8125rem] leading-relaxed text-fg",
        WELL[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Both labels in one cell, so the button keeps its width while it works. */
function Swap({
  busy,
  idle,
  working,
}: {
  busy: boolean;
  idle: ReactNode;
  working: ReactNode;
}) {
  return (
    <span className="inline-grid justify-items-center">
      <span className={cn("col-start-1 row-start-1", busy && "invisible")}>
        {idle}
      </span>
      <span className={cn("col-start-1 row-start-1", !busy && "invisible")}>
        {working}
      </span>
    </span>
  );
}

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
  const locked = pending || armed;

  if (issued) {
    return (
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <CheckCircle2Icon
                aria-hidden="true"
                className="size-4 shrink-0 text-verified"
              />
              {issued.message}
            </span>
          }
          description={`Send this link to ${issued.email} yourself — a message, a call, however you normally reach them. They choose their own password on it, so you never hold one for them.`}
        />
        <CardBody>
          <label
            htmlFor={linkId}
            className="block text-[0.8125rem] font-medium text-fg"
          >
            Invitation link
          </label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <input
              ref={linkRef}
              id={linkId}
              readOnly
              value={issued.link}
              // Selects the whole thing on focus, because this is the one field
              // on the platform where a partial copy fails silently.
              onFocus={(event) => event.currentTarget.select()}
              className={cn(inputClass, "min-w-56 flex-1 font-mono")}
            />
            <Button
              type="button"
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
                <CheckCircle2Icon
                  aria-hidden="true"
                  className="text-verified"
                />
              ) : (
                <CopyIcon aria-hidden="true" />
              )}
              <Swap busy={copied} idle="Copy link" working="Copied" />
            </Button>
          </div>

          <Well tone="warning" className="mt-4">
            <p className="flex items-start gap-2 font-medium">
              <CircleAlertIcon
                aria-hidden="true"
                className="mt-1 size-3.5 shrink-0 text-primary-text"
              />
              <span>
                This is the only time it is shown. We store a fingerprint of it,
                not the link, so nobody — including us — can read it back. If it
                goes astray, invite the address again: the old link stops
                working the moment you do. It expires in 72 hours and works
                once.
              </span>
            </p>
          </Well>

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
            <UserPlusIcon aria-hidden="true" />
            Invite somebody else
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        icon={UserPlusIcon}
        title="Add a teammate"
        // The security promise stays in view; how the link works is one
        // tap away.
        description="No password is ever shared or emailed."
        info="Creates nothing yet. You get a one-time link to hand over; the account exists once they have used it and set their own password."
      />
      <CardBody>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_1fr] lg:items-start">
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

          <fieldset disabled={locked} className="min-w-0">
            <legend className="text-[0.8125rem] font-medium text-fg">
              Their role
            </legend>
            <div className="mt-1.5 divide-y divide-line overflow-hidden rounded-lg border border-line">
              {roles.map((option) => (
                <label
                  key={option}
                  className={cn(
                    "flex items-start gap-3 px-3 py-2.5 transition-[background-color,opacity] duration-150",
                    locked ? "cursor-default" : "cursor-pointer",
                    role === option
                      ? "bg-surface-2/70"
                      : locked
                        ? "opacity-60"
                        : "hover:bg-surface-2/40",
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
                    className="mt-0.5 size-4 shrink-0 cursor-[inherit] accent-fg"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm leading-5 font-medium text-fg">
                      {labels[option]}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                      {blurbs[option]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <Well tone={grave ? "danger" : "neutral"} className="mt-5">
          <p className="flex items-start gap-2">
            {grave ? (
              <TriangleAlertIcon
                aria-hidden="true"
                className="mt-1 size-3.5 shrink-0 text-danger"
              />
            ) : (
              <LinkIcon
                aria-hidden="true"
                className={`mt-1 size-3.5 shrink-0 ${iconText(LinkIcon)}`}
              />
            )}
            <span>
              <strong className="font-semibold">
                Whoever opens this link becomes {labels[role].toLowerCase()}:
              </strong>{" "}
              {consequences[role]}
            </span>
          </p>
        </Well>

        {armed ? (
          <Well tone={grave ? "danger" : "neutral"} className="mt-3">
            <p className="font-medium">
              Invite <strong className="font-semibold">{email.trim()}</strong>{" "}
              as {labels[role].toLowerCase()}? The link works once, expires in
              72 hours, and you can withdraw it until it is used.
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
                <Swap
                  busy={pending}
                  idle="Yes — create the link"
                  working="Creating the link…"
                />
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
          </Well>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button
              type="button"
              size="sm"
              variant={grave ? "outline" : "primary"}
              disabled={pending || !ready}
              onClick={() => {
                setError(null);
                setArmed(true);
              }}
            >
              Continue
            </Button>
            {!ready && email.trim().length > 0 ? (
              <p className="text-xs text-subtle">
                That does not look like an email address yet.
              </p>
            ) : null}
          </div>
        )}

        {error ? (
          <p
            role="alert"
            className="mt-3 flex items-start gap-1.5 text-[0.8125rem] leading-relaxed text-danger"
          >
            <TriangleAlertIcon
              aria-hidden="true"
              className="mt-1 size-3.5 shrink-0"
            />
            <span>{error}</span>
          </p>
        ) : null}
      </CardBody>
    </Card>
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
      <p role="alert" className="text-[0.8125rem] leading-relaxed text-danger">
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
        className="hover:text-danger"
        onClick={() => setArmed(true)}
      >
        Withdraw
        <span className="sr-only"> the invitation for {email}</span>
      </Button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-[0.8125rem] break-all text-muted">
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
        <Swap busy={pending} idle="Yes" working="Withdrawing…" />
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
