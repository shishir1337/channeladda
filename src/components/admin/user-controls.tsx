"use client";

import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { Panel } from "@/components/admin/console";
import { TextArea } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { setUserBanned, setUserRole } from "@/server/actions/admin-users";

/**
 * What staff can do to one account.
 *
 * The two powers are kept visually apart because they are different in kind: a
 * role change hands somebody the keys, a suspension takes their account away.
 * Putting them in one row of buttons invites the wrong click.
 *
 * Suspension asks twice and will not go without a reason — the same four
 * characters the server already insists on, surfaced here so the refusal
 * arrives before the click rather than after it.
 */

/**
 * Deliberately the list this control has always offered. `AGENT` is absent
 * from it, which is worth knowing: the role exists and is labelled, but
 * nothing in this screen can grant it.
 */
const ROLE_ORDER: UserRole[] = ["USER", "MODERATOR", "FINANCE", "SUPERADMIN"];

/** The server refuses a suspension with less than this. */
const MIN_REASON = 4;

export function UserControls({
  userId,
  currentRole,
  banned,
  canSetRole,
  labels,
  blurbs,
}: {
  userId: string;
  currentRole: UserRole;
  banned: boolean;
  /** Only a superadmin sees the role picker at all. */
  canSetRole: boolean;
  labels: Record<string, string>;
  blurbs: Record<string, string>;
}) {
  const reasonId = useId();
  const [role, setRole] = useState<UserRole>(currentRole);
  const [reason, setReason] = useState("");
  const [armed, setArmed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(
    action: () => Promise<{ ok: boolean; message?: string; error?: string }>,
  ) {
    setNote(null);
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "That did not work.");
        return;
      }
      setNote(result.message ?? null);
      setReason("");
      setArmed(false);
    });
  }

  const reasonReady = reason.trim().length >= MIN_REASON;

  return (
    <div className="grid gap-3.5">
      {canSetRole ? (
        <Panel padded={false} className="p-4">
          <h2 className="font-display text-sm font-bold text-fg">Access</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            What this person can reach in the staff area. Takes effect at once
            and is written to the audit trail under your name.
          </p>

          <div className="mt-3 grid gap-2">
            {ROLE_ORDER.map((option) => (
              <label
                key={option}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-card border p-2.5 transition-colors",
                  role === option
                    ? "border-primary bg-primary-soft"
                    : "border-line hover:bg-surface-2",
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={option}
                  checked={role === option}
                  disabled={pending}
                  onChange={() => setRole(option)}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-fg">
                      {labels[option]}
                    </span>
                    {option === currentRole ? (
                      <span className="rounded-full border border-line bg-surface-2 px-1.5 py-0.5 text-[0.625rem] font-semibold text-subtle">
                        current
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-subtle">
                    {blurbs[option]}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {role === "SUPERADMIN" && role !== currentRole ? (
            <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-danger">
              <TriangleAlertIcon
                aria-hidden="true"
                className="mt-px size-3.5 shrink-0"
              />
              <span>
                A superadmin can change fees, grant roles and suspend accounts —
                including yours.
              </span>
            </p>
          ) : null}

          <Button
            type="button"
            size="sm"
            className="mt-3"
            disabled={pending || role === currentRole}
            onClick={() => run(() => setUserRole(userId, role))}
          >
            {role === currentRole ? "No change" : `Make ${labels[role]}`}
          </Button>
        </Panel>
      ) : null}

      <Panel padded={false} className="p-4">
        <h2 className="font-display text-sm font-bold text-fg">
          {banned ? "Suspension" : "Suspend this account"}
        </h2>

        {banned ? (
          <>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              They cannot sign in. Restoring lets them back in; their listings
              stay paused until they relist them.
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-3"
              disabled={pending}
              onClick={() => run(() => setUserBanned(userId, false, ""))}
            >
              {pending ? "Restoring…" : "Restore access"}
            </Button>
          </>
        ) : armed ? (
          <div className="mt-2 rounded-card border border-danger/40 bg-danger-soft p-3">
            <p className="flex items-start gap-2 text-xs leading-relaxed font-medium text-fg">
              <TriangleAlertIcon
                aria-hidden="true"
                className="mt-px size-3.5 shrink-0 text-danger"
              />
              <span>
                This signs them out of every session, blocks sign-in, and pauses
                every live listing they have. They are shown the reason you
                typed.
              </span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={pending || !reasonReady}
                onClick={() => run(() => setUserBanned(userId, true, reason))}
              >
                {pending ? "Suspending…" : "Yes — suspend the account"}
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
          <>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Signs them out, blocks sign-in and pauses every live listing they
              have. Deals already in flight are not ended by this.
            </p>
            <TextArea
              id={reasonId}
              name="reason"
              label="Why"
              hint="Shown to them, and kept in the audit trail."
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Repeatedly asked buyers to pay off-platform"
              className="mt-2.5"
              required
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2.5"
              disabled={pending || !reasonReady}
              onClick={() => {
                setError(null);
                setNote(null);
                setArmed(true);
              }}
            >
              Continue
            </Button>
            {!reasonReady ? (
              <p className="mt-2 text-xs text-subtle">
                A reason is required before this can go ahead.
              </p>
            ) : null}
          </>
        )}
      </Panel>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-xs leading-relaxed text-danger"
        >
          <TriangleAlertIcon
            aria-hidden="true"
            className="mt-px size-3.5 shrink-0"
          />
          <span>{error}</span>
        </p>
      ) : null}
      {note ? (
        <output className="flex items-start gap-1.5 text-xs leading-relaxed text-verified">
          <CheckCircle2Icon
            aria-hidden="true"
            className="mt-px size-3.5 shrink-0"
          />
          <span>{note}</span>
        </output>
      ) : null}
    </div>
  );
}
