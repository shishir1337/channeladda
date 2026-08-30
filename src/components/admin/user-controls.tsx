"use client";

import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/generated/prisma/enums";
import { setUserBanned, setUserRole } from "@/server/actions/admin-users";

/**
 * What staff can do to one account.
 *
 * The two powers are kept visually apart because they are different in kind: a
 * role change hands somebody the keys, a suspension takes their account away.
 * Putting them in one row of buttons invites the wrong click.
 */

const ROLE_ORDER: UserRole[] = ["USER", "MODERATOR", "FINANCE", "SUPERADMIN"];

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
    });
  }

  return (
    <div className="grid gap-4">
      {canSetRole ? (
        <section className="rounded-panel border border-line bg-surface p-4">
          <h2 className="font-display text-sm font-bold text-fg">Access</h2>
          <p className="mt-1 text-xs text-muted">
            What this person can reach in the staff area.
          </p>

          <div className="mt-3 grid gap-2">
            {ROLE_ORDER.map((option) => (
              <label
                key={option}
                className={`flex cursor-pointer items-start gap-2.5 rounded-card border p-2.5 transition-colors ${
                  role === option
                    ? "border-primary/40 bg-primary-soft"
                    : "border-line hover:bg-surface-2"
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={option}
                  checked={role === option}
                  onChange={() => setRole(option)}
                  className="mt-0.5 accent-[var(--color-primary)]"
                />
                <span>
                  <span className="block text-sm font-medium text-fg">
                    {labels[option]}
                  </span>
                  <span className="block text-xs text-subtle">
                    {blurbs[option]}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <Button
            type="button"
            size="sm"
            className="mt-3"
            disabled={pending || role === currentRole}
            onClick={() => run(() => setUserRole(userId, role))}
          >
            {role === currentRole ? "No change" : `Make ${labels[role]}`}
          </Button>
        </section>
      ) : null}

      <section className="rounded-panel border border-line bg-surface p-4">
        <h2 className="font-display text-sm font-bold text-fg">
          {banned ? "Suspension" : "Suspend this account"}
        </h2>

        {banned ? (
          <>
            <p className="mt-1 text-xs text-muted">
              They cannot sign in. Restoring lets them back in; their listings
              stay paused until they relist.
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-3"
              disabled={pending}
              onClick={() => run(() => setUserBanned(userId, false, ""))}
            >
              Restore access
            </Button>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted">
              Signs them out, blocks sign-in and pauses every live listing they
              have.
            </p>
            <label
              htmlFor={reasonId}
              className="mt-3 block text-xs font-medium text-fg"
            >
              Why
            </label>
            <textarea
              id={reasonId}
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Repeatedly asked buyers to pay off-platform"
              className="mt-1.5 w-full rounded-lg border border-line bg-surface-2 p-2.5 text-xs text-fg placeholder:text-subtle focus:border-primary/60 focus:outline-none"
            />
            <Button
              type="button"
              size="sm"
              variant="danger"
              className="mt-2.5"
              disabled={pending}
              onClick={() => run(() => setUserBanned(userId, true, reason))}
            >
              Suspend account
            </Button>
          </>
        )}
      </section>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      {note ? (
        <output className="block text-xs text-verified">{note}</output>
      ) : null}
    </div>
  );
}
