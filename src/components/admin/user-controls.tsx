"use client";

import {
  CheckCircle2Icon,
  InfoIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useId, useState, useTransition } from "react";
import { Panel } from "@/components/admin/console";
import { TextArea, TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import type { KycStatus, UserRole } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import {
  resetUserTwoFactor,
  setAgentIdentity,
  setUserBanned,
  setUserKyc,
  setUserRole,
  signOutEverywhere,
  verifyUserEmail,
} from "@/server/actions/admin-users";

/**
 * What staff can do to one account.
 *
 * The powers are kept visually apart because they are different in kind: a
 * role change hands somebody the keys, a suspension takes their account away,
 * a transfer identity decides who a seller hands a channel to. Putting them in
 * one row of buttons invites the wrong click.
 *
 * Both of the first two ask twice, and a suspension will not go without a
 * reason — the same four characters the server already insists on, surfaced
 * here so the refusal arrives before the click rather than after it.
 *
 * The role list is a prop, taken from `ROLES` in `server/admin-users`. It used
 * to be a second list written out here, which is how `AGENT` — the role the
 * whole product runs on — ended up labelled, documented and impossible to
 * grant from any screen. One list, one source, no drift.
 */

/** The server refuses a suspension with less than this. */
const MIN_REASON = 4;

/**
 * Roles whose grant is worth a red confirmation rather than a neutral one.
 *
 * FINANCE can send money out of the platform and SUPERADMIN can suspend the
 * person granting it. AGENT is not on this list because it takes nothing from
 * anybody — but it does hand over custody of other people's channels, so it
 * still asks twice, in the ordinary tone.
 */
const GRAVE: readonly UserRole[] = ["FINANCE", "SUPERADMIN"];

export function UserControls({
  userId,
  currentRole,
  banned,
  canSetRole,
  isSelf,
  roles,
  labels,
  blurbs,
  consequences,
  holds,
  maxHolds,
  agentEmail,
  agentBrand,
}: {
  userId: string;
  currentRole: UserRole;
  banned: boolean;
  /** Only a superadmin sees the role picker at all. */
  canSetRole: boolean;
  /**
   * Whether this is the signed-in person's own account. The server refuses
   * either action on yourself; this is so the refusal is not the first time
   * anybody mentions it.
   */
  isSelf: boolean;
  /** Every grantable role, in escalating order. From the server. */
  roles: readonly UserRole[];
  labels: Record<string, string>;
  blurbs: Record<string, string>;
  /** What granting each role lets this person do to other people. */
  consequences: Record<string, string>;
  /** Safest channels this person is holding right now. */
  holds: number;
  /** `PlatformSettings.maxHoldsPerAgent`. */
  maxHolds: number;
  agentEmail: string | null;
  agentBrand: string | null;
}) {
  const reasonId = useId();
  const [role, setRole] = useState<UserRole>(currentRole);
  const [reason, setReason] = useState("");
  const [armed, setArmed] = useState(false);
  const [roleArmed, setRoleArmed] = useState(false);
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
      setRoleArmed(false);
    });
  }

  const reasonReady = reason.trim().length >= MIN_REASON;
  const changing = role !== currentRole;
  const grave = GRAVE.includes(role);
  // Removing access from somebody who is holding channels is the case that
  // quietly breaks deals: the role goes, the custody does not.
  const orphaning = currentRole === "AGENT" && role !== "AGENT" && holds > 0;

  return (
    <div className="grid gap-3.5">
      {isSelf ? (
        <Panel padded={false} className="p-4">
          <h2 className="flex items-center gap-2 font-display text-sm font-bold text-fg">
            <ShieldAlertIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-subtle"
            />
            This is your own account
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            Nobody can change their own role or suspend themselves, including
            you. It is how a mistake in this panel stays something another
            superadmin can undo rather than something that needs a developer and
            a database. Ask a colleague with the superadmin role.
          </p>
        </Panel>
      ) : null}

      {canSetRole && !isSelf ? (
        <Panel padded={false} className="p-4">
          <h2 className="font-display text-sm font-bold text-fg">Access</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            What this person can reach in the staff area. Takes effect at once
            and is written to the audit trail under your name.
          </p>

          <fieldset className="mt-3 grid gap-2" disabled={pending || roleArmed}>
            <legend className="sr-only">Role</legend>
            {roles.map((option) => (
              <label
                key={option}
                className={cn(
                  "flex items-start gap-2.5 rounded-card border p-2.5 transition-colors",
                  roleArmed ? "cursor-default" : "cursor-pointer",
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
                  onChange={() => {
                    setRole(option);
                    setError(null);
                    setNote(null);
                  }}
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
          </fieldset>

          {/* What you are handing over, before you hand it over. */}
          {changing ? (
            <div
              className={cn(
                "mt-3 rounded-card border p-3",
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
                  <InfoIcon
                    aria-hidden="true"
                    className="mt-px size-3.5 shrink-0 text-subtle"
                  />
                )}
                <span>
                  <strong className="font-semibold">
                    As {labels[role].toLowerCase()}:
                  </strong>{" "}
                  {consequences[role]}
                </span>
              </p>
              {role === "AGENT" ? (
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  They may hold up to {maxHolds}{" "}
                  {maxHolds === 1 ? "channel" : "channels"} at once, which is
                  the platform-wide cap under Settings. Set the address sellers
                  invite below, or every deal they take will go out under
                  whatever the person assigning it types.
                </p>
              ) : null}
              {orphaning ? (
                <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed font-medium text-danger">
                  <TriangleAlertIcon
                    aria-hidden="true"
                    className="mt-px size-3.5 shrink-0"
                  />
                  <span>
                    They are holding {holds}{" "}
                    {holds === 1 ? "channel" : "channels"} right now. Removing
                    the role does not hand those back: each of those deals keeps
                    this person as its agent of record until somebody reassigns
                    it from the deal desk.
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}

          {roleArmed ? (
            <div
              className={cn(
                "mt-3 rounded-card border p-3",
                grave
                  ? "border-danger/40 bg-danger-soft"
                  : "border-primary/40 bg-primary-soft",
              )}
            >
              <p className="text-xs leading-relaxed font-medium text-fg">
                Change them from {labels[currentRole].toLowerCase()} to{" "}
                <strong className="font-semibold">
                  {labels[role].toLowerCase()}
                </strong>
                ? This applies immediately and is recorded against your name.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={grave ? "danger" : "primary"}
                  disabled={pending}
                  onClick={() => run(() => setUserRole(userId, role))}
                >
                  {pending ? "Applying…" : `Yes — make ${labels[role]}`}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setRoleArmed(false)}
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
              disabled={pending || !changing}
              onClick={() => {
                setError(null);
                setNote(null);
                setRoleArmed(true);
              }}
            >
              {changing ? `Make ${labels[role]}` : "No change"}
            </Button>
          )}
        </Panel>
      ) : null}

      {/* Only an agent has one, and only a superadmin sets it. */}
      {canSetRole && currentRole === "AGENT" ? (
        <AgentIdentity
          userId={userId}
          email={agentEmail}
          brand={agentBrand}
          holds={holds}
          maxHolds={maxHolds}
        />
      ) : null}

      {isSelf ? null : (
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
                  This signs them out of every session, blocks sign-in, and
                  pauses every live listing they have. They are shown the reason
                  you typed.
                </span>
              </p>
              {holds > 0 ? (
                <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed font-medium text-danger">
                  <TriangleAlertIcon
                    aria-hidden="true"
                    className="mt-px size-3.5 shrink-0"
                  />
                  <span>
                    They are holding {holds}{" "}
                    {holds === 1 ? "channel" : "channels"} as an agent.
                    Suspending them does not return those: the channels stay in
                    this account&rsquo;s custody until a deal is reassigned or
                    returned to its seller.
                  </span>
                </p>
              ) : null}
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
                Signs them out, blocks sign-in and pauses every live listing
                they have. Deals already in flight are not ended by this.
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
      )}

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

/**
 * The address a seller is told to invite as channel owner.
 *
 * Its own panel because it is the agent's identity rather than their access,
 * and because it is the thing a seller sees: a typo here is a channel invited
 * to nobody and a deal that sits in "awaiting custody" while both sides wait
 * for each other.
 */
function AgentIdentity({
  userId,
  email: stored,
  brand: storedBrand,
  holds,
  maxHolds,
}: {
  userId: string;
  email: string | null;
  brand: string | null;
  holds: number;
  maxHolds: number;
}) {
  const emailId = useId();
  const brandId = useId();
  const [email, setEmail] = useState(stored ?? "");
  const [brand, setBrand] = useState(storedBrand ?? "Channel Adda Transfers");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ready = email.trim().length > 3 && brand.trim().length > 1;
  const dirty = email.trim() !== (stored ?? "") || brand.trim() !== storedBrand;
  const atCap = holds >= maxHolds;

  return (
    <Panel padded={false} className="p-4">
      <h2 className="font-display text-sm font-bold text-fg">
        Transfer identity
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Copied onto every deal they take, so one agent reaches every seller as
        the same person. Without it, whoever assigns the deal types an address
        from memory.
      </p>

      {stored === null ? (
        <p className="mt-2.5 flex items-start gap-1.5 rounded-card border border-primary/35 bg-primary-soft p-2.5 text-xs leading-relaxed text-fg">
          <TriangleAlertIcon
            aria-hidden="true"
            className="mt-px size-3.5 shrink-0 text-primary-text"
          />
          <span>Not set. Nothing will be filled in for them.</span>
        </p>
      ) : null}

      <div className="mt-2.5 grid gap-3">
        <TextField
          id={emailId}
          name="agentEmail"
          type="email"
          label="Google account sellers invite"
          hint="The account that will genuinely own the channel."
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="transfers@channeladda.com"
          autoComplete="off"
          required
        />
        <TextField
          id={brandId}
          name="agentBrand"
          label="Shown to the seller as"
          value={brand}
          onChange={(event) => setBrand(event.target.value)}
          placeholder="Channel Adda Transfers"
          autoComplete="off"
          required
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          type="button"
          size="sm"
          disabled={pending || !ready || !dirty}
          onClick={() => {
            setNote(null);
            setError(null);
            startTransition(async () => {
              const result = await setAgentIdentity(
                userId,
                email.trim(),
                brand.trim(),
              );
              if (result.ok) setNote(result.message);
              else setError(result.error);
            });
          }}
        >
          {pending ? "Saving…" : dirty ? "Save identity" : "Saved"}
        </Button>
        <p className="tnum text-xs text-subtle">
          Holding {holds} of {maxHolds}
          {atCap ? " — at the cap" : ""}
        </p>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs leading-relaxed text-danger">
          {error}
        </p>
      ) : null}
      {note ? (
        <output className="mt-2 block text-xs leading-relaxed text-verified">
          {note}
        </output>
      ) : null}
    </Panel>
  );
}

// ------------------------------------------------------------ shared bits

type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/** One outcome line, the same shape every panel on this page uses. */
function Outcome({
  note,
  error,
}: {
  note: string | null;
  error: string | null;
}) {
  if (error) {
    return (
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
    );
  }
  if (note) {
    return (
      <output className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-verified">
        <CheckCircle2Icon
          aria-hidden="true"
          className="mt-px size-3.5 shrink-0"
        />
        <span>{note}</span>
      </output>
    );
  }
  return null;
}

// ---------------------------------------------------------- identity (KYC)

const KYC_CHOICES: {
  status: KycStatus;
  label: string;
  meaning: string;
}[] = [
  {
    status: "APPROVED",
    label: "Approved",
    meaning:
      "You checked their identity and it holds up. Their seller page can appear in the public sellers directory and among the top sellers on the homepage.",
  },
  {
    status: "REJECTED",
    label: "Rejected",
    meaning:
      "The check failed. They stay out of the directory. Their listings are not touched — suspend the account if that is what this calls for.",
  },
  {
    status: "NOT_STARTED",
    label: "Not started",
    meaning:
      "Clears an earlier decision, as if no check had been done. Use it to undo a mistake.",
  },
];

/**
 * Recording an identity check that was done off-platform.
 *
 * Nothing here looks at a document — there is no upload flow yet — so the
 * panel says that plainly and asks what was checked. Without this control the
 * status could never leave NOT_STARTED, and the public sellers directory,
 * which only lists approved sellers, was empty on every real database.
 */
export function KycControl({
  userId,
  current,
  canSet,
  blockedBecause,
}: {
  userId: string;
  current: KycStatus;
  /** Moderator or superadmin, not their own account, and not outranked. */
  canSet: boolean;
  /** Why `canSet` is false, in a sentence. */
  blockedBecause?: string;
}) {
  const reasonId = useId();
  const firstOther = KYC_CHOICES.find((choice) => choice.status !== current);
  const [picked, setStatus] = useState<KycStatus>(
    firstOther?.status ?? "APPROVED",
  );
  // After a save the page re-renders with the new `current`, which is no
  // longer offered as a choice. Falling back keeps one option selected rather
  // than leaving the group with nothing checked and Continue submitting a
  // no-change.
  const status = picked !== current ? picked : (firstOther?.status ?? picked);
  const [reason, setReason] = useState("");
  const [armed, setArmed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reasonReady = reason.trim().length >= MIN_REASON;
  const chosen = KYC_CHOICES.find((choice) => choice.status === status);
  const currentLabel =
    KYC_CHOICES.find((choice) => choice.status === current)?.label ??
    current.toLowerCase().replace(/_/g, " ");

  return (
    <Panel padded={false} className="p-4">
      <h2 className="font-display text-sm font-bold text-fg">Identity check</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Currently{" "}
        <strong className="font-semibold text-fg">
          {currentLabel.toLowerCase()}
        </strong>
        . This records the outcome of a check you did yourself — a video call, a
        document sent to support. Nothing here inspects a document.
      </p>

      {!canSet ? (
        <p className="mt-2.5 text-xs leading-relaxed text-subtle">
          {blockedBecause ?? "You cannot change this."}
        </p>
      ) : (
        <>
          <fieldset className="mt-3 grid gap-2" disabled={pending || armed}>
            <legend className="sr-only">New identity status</legend>
            {KYC_CHOICES.filter((choice) => choice.status !== current).map(
              (choice) => (
                <label
                  key={choice.status}
                  className={cn(
                    "flex items-start gap-2.5 rounded-card border p-2.5 transition-colors",
                    armed ? "cursor-default" : "cursor-pointer",
                    status === choice.status
                      ? "border-primary bg-primary-soft"
                      : "border-line hover:bg-surface-2",
                  )}
                >
                  <input
                    type="radio"
                    name={`kyc-${userId}`}
                    value={choice.status}
                    checked={status === choice.status}
                    onChange={() => {
                      setStatus(choice.status);
                      setError(null);
                      setNote(null);
                    }}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-fg">
                      {choice.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-subtle">
                      {choice.meaning}
                    </span>
                  </span>
                </label>
              ),
            )}
          </fieldset>

          {armed ? (
            <div className="mt-3 rounded-card border border-primary/40 bg-primary-soft p-3">
              <p className="text-xs leading-relaxed font-medium text-fg">
                Mark their identity{" "}
                <strong className="font-semibold">
                  {chosen?.label.toLowerCase()}
                </strong>
                ? It is recorded against your name with the reason you gave.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setNote(null);
                    setError(null);
                    startTransition(async () => {
                      const result = await setUserKyc(userId, status, reason);
                      if (!result.ok) {
                        setError(result.error);
                        return;
                      }
                      setNote(result.message);
                      setReason("");
                      setArmed(false);
                    });
                  }}
                >
                  {pending
                    ? "Saving…"
                    : `Yes — mark ${chosen?.label.toLowerCase()}`}
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
              <TextArea
                id={reasonId}
                name="kycReason"
                label="What you checked"
                hint="Kept in the audit trail. Not shown to them."
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Passport matched on a video call, 17 Oct"
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
        </>
      )}

      <Outcome note={note} error={error} />
    </Panel>
  );
}

// -------------------------------------------------------- account recovery

/**
 * Getting a locked-out person back in, without a developer.
 *
 * Three ways people get stuck, and before this not one of them had a button:
 * the verification email never arrived (with no mail provider, it never
 * does, and an unverified account cannot make an offer); somebody might be in
 * their account; or the phone with their codes is gone.
 */
export function AccountRecovery({
  userId,
  emailVerified,
  sessions,
  twoFactorEnabled,
  canVerifyEmail,
  canEndSessions,
  canResetTwoFactor,
  endSessionsBlockedBecause,
}: {
  userId: string;
  emailVerified: boolean;
  sessions: number;
  twoFactorEnabled: boolean;
  /** Any staff, not on their own account. */
  canVerifyEmail: boolean;
  /** Any staff on a member; a superadmin on a colleague; never yourself. */
  canEndSessions: boolean;
  /** Superadmin, not on their own account. */
  canResetTwoFactor: boolean;
  endSessionsBlockedBecause?: string;
}) {
  return (
    <Panel padded={false} className="p-4">
      <h2 className="font-display text-sm font-bold text-fg">
        Help them back in
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        For somebody who is locked out or worried. Each of these is recorded
        against your name.
      </p>

      <div className="mt-3 grid gap-3 divide-y divide-line">
        <RecoveryStep
          title="Email address"
          status={emailVerified ? "Verified" : "Not verified"}
          statusTone={emailVerified ? "verified" : "danger"}
          body={
            emailVerified
              ? "Nothing to do."
              : "They cannot make an offer until this is verified, and the email that would do it may never arrive. Confirm the address another way first — they wrote in from it, or you called them."
          }
          action={
            !emailVerified && canVerifyEmail
              ? {
                  idle: "Mark email verified",
                  prompt:
                    "Mark this address verified? Only do this if you have confirmed it belongs to them.",
                  confirm: "Yes — mark verified",
                  run: () => verifyUserEmail(userId),
                }
              : null
          }
        />

        <RecoveryStep
          title="Sessions"
          status={
            sessions === 0
              ? "Signed out"
              : `${sessions} ${sessions === 1 ? "device" : "devices"}`
          }
          body="Ends every session they have, on every device. Their password still works. This is for somebody worried that someone else is in their account, or who signed in on a shared computer — where suspending would be far too much."
          blocked={
            sessions > 0 && !canEndSessions
              ? endSessionsBlockedBecause
              : undefined
          }
          action={
            sessions > 0 && canEndSessions
              ? {
                  idle: "Sign out everywhere",
                  prompt: `End all ${sessions} ${sessions === 1 ? "session" : "sessions"}? They will have to sign in again wherever they are.`,
                  confirm: "Yes — sign them out",
                  run: () => signOutEverywhere(userId),
                }
              : null
          }
        />

        <TwoFactorReset
          userId={userId}
          enabled={twoFactorEnabled}
          canReset={canResetTwoFactor}
        />
      </div>
    </Panel>
  );
}

/** One remedy: what is true now, what pressing the button does, and the button. */
function RecoveryStep({
  title,
  status,
  statusTone = "neutral",
  body,
  action,
  blocked,
}: {
  title: string;
  status: string;
  statusTone?: "neutral" | "verified" | "danger";
  body: string;
  action: {
    idle: string;
    prompt: string;
    confirm: string;
    run: () => Promise<ActionResult>;
  } | null;
  blocked?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="pt-3 first:pt-0">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-fg">{title}</span>
        <span
          className={cn(
            "tnum text-xs font-semibold",
            statusTone === "verified"
              ? "text-verified"
              : statusTone === "danger"
                ? "text-danger"
                : "text-muted",
          )}
        >
          {status}
        </span>
      </p>
      <p className="mt-1 text-xs leading-relaxed text-subtle">{body}</p>
      {blocked ? (
        <p className="mt-1.5 text-xs leading-relaxed text-subtle">{blocked}</p>
      ) : null}

      {action ? (
        armed ? (
          <div className="mt-2.5 rounded-card border border-primary/40 bg-primary-soft p-3">
            <p className="text-xs leading-relaxed font-medium text-fg">
              {action.prompt}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setNote(null);
                  setError(null);
                  startTransition(async () => {
                    const result = await action.run();
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setNote(result.message);
                    setArmed(false);
                  });
                }}
              >
                {pending ? "Working…" : action.confirm}
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
            variant="outline"
            className="mt-2.5"
            disabled={pending}
            onClick={() => {
              setNote(null);
              setError(null);
              setArmed(true);
            }}
          >
            {action.idle}
          </Button>
        )
      ) : null}

      <Outcome note={note} error={error} />
    </div>
  );
}

/**
 * Clearing a lost second factor.
 *
 * Its own component because it is the one remedy here that asks for a
 * reason, and the one that is red: whoever can press it can turn a stolen
 * password into a working sign-in.
 */
function TwoFactorReset({
  userId,
  enabled,
  canReset,
}: {
  userId: string;
  enabled: boolean;
  canReset: boolean;
}) {
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [armed, setArmed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reasonReady = reason.trim().length >= MIN_REASON;

  return (
    <div className="pt-3">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-fg">
          Two-step verification
        </span>
        <span
          className={cn(
            "text-xs font-semibold",
            enabled ? "text-verified" : "text-muted",
          )}
        >
          {enabled ? "On" : "Off"}
        </span>
      </p>
      <p className="mt-1 text-xs leading-relaxed text-subtle">
        {enabled
          ? "If they have lost the device their codes are on, this turns it off so they can sign in with their password and set up a new one."
          : "Nothing to reset. Only they can turn it on, under Security."}
      </p>

      {enabled && !canReset ? (
        <p className="mt-1.5 text-xs leading-relaxed text-subtle">
          Only a superadmin can reset this, and nobody can reset their own.
        </p>
      ) : null}

      {enabled && canReset ? (
        armed ? (
          <div className="mt-2.5 rounded-card border border-danger/40 bg-danger-soft p-3">
            <p className="flex items-start gap-2 text-xs leading-relaxed font-medium text-fg">
              <TriangleAlertIcon
                aria-hidden="true"
                className="mt-px size-3.5 shrink-0 text-danger"
              />
              <span>
                Anyone with their password can then sign in as them. Only do
                this once you are sure the person asking is the account holder.
                It also signs them out everywhere.
              </span>
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={pending || !reasonReady}
                onClick={() => {
                  setNote(null);
                  setError(null);
                  startTransition(async () => {
                    const result = await resetUserTwoFactor(userId, reason);
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setNote(result.message);
                    setReason("");
                    setArmed(false);
                  });
                }}
              >
                {pending ? "Resetting…" : "Yes — reset two-step verification"}
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
            <TextArea
              id={reasonId}
              name="twoFactorReason"
              label="How they proved it was them"
              hint="Kept in the audit trail."
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Video call, matched the KYC photo; phone lost 15 Oct"
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
                setNote(null);
                setError(null);
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
        )
      ) : null}

      <Outcome note={note} error={error} />
    </div>
  );
}
