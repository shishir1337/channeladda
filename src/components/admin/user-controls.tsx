"use client";

import {
  CheckCircle2Icon,
  CircleAlertIcon,
  InfoIcon,
  LockIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { type ReactNode, useId, useState, useTransition } from "react";
import { InfoTip } from "@/components/app/info-tip";
import { Callout, Card, CardBody, CardHeader } from "@/components/app/kit";
import { TextArea, TextField } from "@/components/auth/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { iconText } from "@/components/ui/icon-hue";
import type { DealLevel, KycStatus, UserRole } from "@/generated/prisma/enums";
import { DEAL_LEVELS, isCustodianRole, levelLabel } from "@/lib/custody-roles";
import { cn } from "@/lib/utils";
import {
  resetUserTwoFactor,
  setAgentIdentity,
  setDealLevel,
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
 * one row of buttons invites the wrong click. So each kind is its own card —
 * access, identity check, getting them back in — and the two that can do real
 * harm in the wrong hands (suspending, and clearing a second factor) sit apart
 * at the bottom, in the danger zone.
 *
 * A role change and a suspension both ask twice, and a suspension will not go
 * without a reason — the same four characters the server already insists on,
 * surfaced here so the refusal arrives before the click rather than after it.
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

// ------------------------------------------------------------ shared bits

type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/** Secondary copy under a control's name. */
const BODY = "mt-1 text-[0.8125rem] leading-relaxed text-muted";

/**
 * `outline`, in the danger colour: the first step of something destructive.
 * The solid red button is kept for the confirmation itself.
 */
const DANGER_OUTLINE =
  "text-danger hover:border-danger/40 hover:bg-danger-soft/60 app:hover:border-danger/40";

const WELL = {
  neutral: "border-line bg-surface-2/60",
  warning: "border-primary/30 bg-primary-soft/70",
  danger: "border-danger/25 bg-danger-soft/70",
} as const;

/**
 * The inset that holds a consequence or a confirmation. A tinted well rather
 * than a card, so a card never holds a card.
 */
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

/**
 * Holds both labels in one cell, so a button keeps the width of the wider
 * one while it works instead of jumping as "Saving…" swaps in.
 */
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

/** A radio group drawn as one bordered list, so options read as a set. */
function Choices({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
      {children}
    </div>
  );
}

function Choice({
  name,
  value,
  checked,
  locked,
  onSelect,
  title,
  tag,
  detail,
  more,
}: {
  name: string;
  value: string;
  checked: boolean;
  /** Frozen while a confirmation is open or a save is in flight. */
  locked: boolean;
  onSelect: () => void;
  title: ReactNode;
  tag?: ReactNode;
  /** One short line under the option's name. */
  detail?: ReactNode;
  /** The rest of what the option means, behind an (i) at the row's end. */
  more?: ReactNode;
}) {
  return (
    // The (i) sits beside the label rather than in it: a button inside a
    // label would become part of the radio's name, and a click on it would
    // be a click on the label.
    <div
      className={cn(
        "flex items-start transition-[background-color,opacity] duration-150",
        checked
          ? "bg-surface-2/70"
          : locked
            ? "opacity-60"
            : "hover:bg-surface-2/40",
      )}
    >
      <label
        className={cn(
          "flex min-w-0 flex-1 items-start gap-3 px-3 py-2.5",
          locked ? "cursor-default" : "cursor-pointer",
        )}
      >
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          onChange={onSelect}
          className="mt-0.5 size-4 shrink-0 cursor-[inherit] accent-fg"
        />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5 text-sm leading-5 font-medium text-fg">
            {title}
            {tag}
          </span>
          {detail ? (
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">
              {detail}
            </span>
          ) : null}
        </span>
      </label>
      {more ? (
        <InfoTip
          label={`About ${typeof title === "string" ? title : "this option"}`}
          className="mt-2.5 mr-3"
        >
          {more}
        </InfoTip>
      ) : null}
    </div>
  );
}

/** One remedy's name, what it is for, and what is true of it now. */
function StepHead({
  title,
  status,
  info,
}: {
  title: string;
  status?: ReactNode;
  /** Why somebody would reach for this, behind an (i) beside the name. */
  info?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm leading-5 font-medium text-fg">{title}</h3>
        {info ? <InfoTip label={`About ${title}`}>{info}</InfoTip> : null}
      </div>
      {status}
    </div>
  );
}

/** "A reason is required", beside the button it is holding back. */
function ReasonHint({ ready }: { ready: boolean }) {
  return ready ? null : (
    <p className="text-xs text-subtle">
      A reason is required before this can go ahead.
    </p>
  );
}

/** One outcome line, the same shape every card on this page uses. */
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
        className="mt-3 flex items-start gap-1.5 text-[0.8125rem] leading-relaxed text-danger"
      >
        <TriangleAlertIcon
          aria-hidden="true"
          className="mt-1 size-3.5 shrink-0"
        />
        <span>{error}</span>
      </p>
    );
  }
  if (note) {
    return (
      <output className="mt-3 flex items-start gap-1.5 text-[0.8125rem] leading-relaxed text-verified">
        <CheckCircle2Icon
          aria-hidden="true"
          className="mt-1 size-3.5 shrink-0"
        />
        <span>{note}</span>
      </output>
    );
  }
  return null;
}

// ------------------------------------------------------------------ access

export function UserControls({
  userId,
  currentRole,
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
  dealLevel,
}: {
  userId: string;
  currentRole: UserRole;
  /** Only a superadmin sees the role picker at all. */
  canSetRole: boolean;
  /**
   * Whether this is the signed-in person's own account. The server refuses
   * a role change or a suspension on yourself; this is so the refusal is not
   * the first time anybody mentions it.
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
  /** Which deals they may run; only meaningful on someone who runs deals. */
  dealLevel: DealLevel | null;
}) {
  const [role, setRole] = useState<UserRole>(currentRole);
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
      setRoleArmed(false);
    });
  }

  const changing = role !== currentRole;
  const grave = GRAVE.includes(role);
  // Removing access from somebody who is holding channels is the case that
  // quietly breaks deals: the role goes, the custody does not.
  const orphaning =
    isCustodianRole(currentRole) && !isCustodianRole(role) && holds > 0;

  return (
    <>
      {isSelf ? (
        <Callout
          tone="neutral"
          icon={ShieldAlertIcon}
          title={
            <span className="inline-flex items-center gap-1.5">
              This is your own account
              <InfoTip label="Why nobody can change their own account">
                It is how a mistake in this panel stays something another
                superadmin can undo rather than something that needs a developer
                and a database.
              </InfoTip>
            </span>
          }
        >
          Nobody can change their own role or suspend themselves, including you.
          Ask a colleague with the superadmin role.
        </Callout>
      ) : null}

      {canSetRole && !isSelf ? (
        <Card>
          <CardHeader
            as="h2"
            title="Access"
            // The confirmation below says the same at the moment it matters:
            // "applies immediately and is recorded against your name".
            info="What they can reach in the staff area. Takes effect at once and is written to the audit trail under your name."
          />
          <CardBody>
            <fieldset className="min-w-0" disabled={pending || roleArmed}>
              <legend className="sr-only">Role</legend>
              <Choices>
                {roles.map((option) => (
                  <Choice
                    key={option}
                    name="role"
                    value={option}
                    checked={role === option}
                    locked={pending || roleArmed}
                    onSelect={() => {
                      setRole(option);
                      setError(null);
                      setNote(null);
                    }}
                    title={labels[option]}
                    tag={
                      option === currentRole ? (
                        <Badge size="sm">Current</Badge>
                      ) : null
                    }
                    detail={blurbs[option]}
                  />
                ))}
              </Choices>
            </fieldset>

            {/* What you are handing over, before you hand it over. */}
            {changing ? (
              <Well tone={grave ? "danger" : "neutral"} className="mt-3">
                <p className="flex items-start gap-2">
                  {grave ? (
                    <TriangleAlertIcon
                      aria-hidden="true"
                      className="mt-1 size-3.5 shrink-0 text-danger"
                    />
                  ) : (
                    <InfoIcon
                      aria-hidden="true"
                      className="mt-1 size-3.5 shrink-0 text-subtle"
                    />
                  )}
                  <span>
                    <strong className="font-semibold">
                      As {labels[role].toLowerCase()}:
                    </strong>{" "}
                    {consequences[role]}
                  </span>
                </p>
                {isCustodianRole(role) && role !== "SUPERADMIN" ? (
                  <p className="mt-2 pl-5.5 text-muted">
                    They may hold up to {maxHolds}{" "}
                    {maxHolds === 1 ? "channel" : "channels"} at once, which is
                    the platform-wide cap under Settings. Set the address
                    sellers invite below, or every deal they take will go out
                    under whatever the person assigning it types.
                  </p>
                ) : null}
                {orphaning ? (
                  <p className="mt-2 flex items-start gap-2 font-medium text-danger">
                    <TriangleAlertIcon
                      aria-hidden="true"
                      className="mt-1 size-3.5 shrink-0"
                    />
                    <span>
                      They are holding {holds}{" "}
                      {holds === 1 ? "channel" : "channels"} right now. Removing
                      the role does not hand those back: each of those deals
                      keeps this person as its agent of record until somebody
                      reassigns it from the deal desk.
                    </span>
                  </p>
                ) : null}
              </Well>
            ) : null}

            {roleArmed ? (
              <Well tone={grave ? "danger" : "neutral"} className="mt-3">
                <p className="font-medium">
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
                    <Swap
                      busy={pending}
                      idle={`Yes — make ${labels[role]}`}
                      working="Applying…"
                    />
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
              </Well>
            ) : (
              <Button
                type="button"
                size="sm"
                // Gold only once there is something to apply; a grave grant
                // never gets gold at all, only the red confirmation after.
                variant={
                  !changing ? "secondary" : grave ? "outline" : "primary"
                }
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

            <Outcome note={note} error={error} />
          </CardBody>
        </Card>
      ) : null}

      {/* Only somebody who runs deals has these, and only a superadmin
          sets them here. They can change their own identity themselves. */}
      {canSetRole && isCustodianRole(currentRole) ? (
        <DealLevelControl userId={userId} level={dealLevel} />
      ) : null}
      {canSetRole && isCustodianRole(currentRole) ? (
        <AgentIdentity
          userId={userId}
          email={agentEmail}
          brand={agentBrand}
          holds={holds}
          maxHolds={maxHolds}
        />
      ) : null}
    </>
  );
}

/**
 * Which deals this person may run, by agreed price.
 *
 * The owner's levels are strict bands: level 1 takes only deals under
 * $10,000, level 2 only $10,000 to under $100,000, level 3 only $100,000 and
 * up. "Any size" is how agents worked before levels, and the superadmin is
 * never limited whatever is set here.
 */
function DealLevelControl({
  userId,
  level: stored,
}: {
  userId: string;
  level: DealLevel | null;
}) {
  const [level, setLevel] = useState<DealLevel | null>(stored);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = level !== stored;
  const options: { value: DealLevel | null; detail: string }[] = [
    ...DEAL_LEVELS.map((value) => ({
      value,
      detail:
        value === "UNDER_10K"
          ? "Deals under $10,000, and nothing larger."
          : value === "UNDER_100K"
            ? "Deals from $10,000 to under $100,000 only."
            : "Deals of $100,000 and up only.",
    })),
    { value: null, detail: "No limit. How agents worked before levels." },
  ];

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Deal level"
        info="Which deals they can claim or be given, by the agreed price. Deals they already run are not affected by a change."
      />
      <CardBody>
        <fieldset className="min-w-0" disabled={pending}>
          <legend className="sr-only">Deal level</legend>
          <Choices>
            {options.map((option) => (
              <Choice
                key={option.value ?? "any"}
                name="dealLevel"
                value={option.value ?? "any"}
                checked={level === option.value}
                locked={pending}
                onSelect={() => {
                  setLevel(option.value);
                  setNote(null);
                  setError(null);
                }}
                title={levelLabel(option.value)}
                tag={
                  option.value === stored ? (
                    <Badge size="sm">Current</Badge>
                  ) : null
                }
                detail={option.detail}
              />
            ))}
          </Choices>
        </fieldset>
        <Button
          type="button"
          size="sm"
          variant={dirty ? "primary" : "secondary"}
          className="mt-3"
          disabled={pending || !dirty}
          onClick={() => {
            setNote(null);
            setError(null);
            startTransition(async () => {
              const result = await setDealLevel(userId, level);
              if (result.ok) setNote(result.message);
              else setError(result.error);
            });
          }}
        >
          <Swap
            busy={pending}
            idle={dirty ? "Save level" : "Saved"}
            working="Saving…"
          />
        </Button>
        <Outcome note={note} error={error} />
      </CardBody>
    </Card>
  );
}

/**
 * The address a seller is told to invite as channel owner.
 *
 * Its own card because it is the agent's identity rather than their access,
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
    <Card>
      <CardHeader
        as="h2"
        title="Transfer identity"
        info="Copied onto every deal they take, so one agent reaches every seller as the same person."
      />
      <CardBody>
        {stored === null ? (
          <Well tone="warning" className="mb-4">
            <p className="flex items-start gap-2">
              <CircleAlertIcon
                aria-hidden="true"
                className="mt-1 size-3.5 shrink-0 text-primary-text"
              />
              <span>
                Not set. Nothing will be filled in for them, so whoever assigns
                the deal types an address from memory.
              </span>
            </p>
          </Well>
        ) : null}

        <div className="grid gap-4">
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

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            type="button"
            size="sm"
            variant={dirty ? "primary" : "secondary"}
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
            <Swap
              busy={pending}
              idle={dirty ? "Save identity" : "Saved"}
              working="Saving…"
            />
          </Button>
          <p
            className={cn(
              "text-xs tabular-nums",
              atCap ? "font-medium text-danger" : "text-subtle",
            )}
          >
            Holding {holds} of {maxHolds}
            {atCap ? " — at the cap" : ""}
          </p>
        </div>

        <Outcome note={note} error={error} />
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------- identity (KYC)

/**
 * Each status, and what follows from it. Kept as two halves of one
 * explanation so the confirmation can repeat the consequence on its own.
 */
const KYC_CHOICES: {
  status: KycStatus;
  label: string;
  meaning: string;
  more: string;
}[] = [
  {
    status: "APPROVED",
    label: "Approved",
    meaning: "You checked their identity and it holds up.",
    more: "The Verified badge shows beside their name, and their seller page can appear in the public sellers directory and among the top sellers on the homepage.",
  },
  {
    status: "REJECTED",
    label: "Rejected",
    meaning: "The check failed.",
    more: "No Verified badge, and they stay out of the directory. They can send their ID again. Their listings are not touched — suspend the account if that is what this calls for.",
  },
  {
    status: "NOT_STARTED",
    label: "Not started",
    meaning: "Clears an earlier decision, as if no check had been done.",
    more: "Use it to undo a mistake. A check waiting in ID checks leaves the queue, and they can send one again.",
  },
];

const KYC_VARIANT: Record<
  KycStatus,
  "neutral" | "info" | "verified" | "danger"
> = {
  NOT_STARTED: "neutral",
  PENDING: "info",
  APPROVED: "verified",
  REJECTED: "danger",
};

/**
 * Recording an identity check by hand, for one done off-platform.
 *
 * Documents members send are reviewed in ID checks (`/admin/verification`);
 * this writes through the same `setKycStatus`, so the two always agree. Only
 * an approved check shows the Verified badge, and the reason typed here stays
 * in the audit trail — it is never shown to the member.
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
    <Card>
      <CardHeader
        as="h2"
        title="Identity check"
        info="Only an approved check shows the Verified badge. For a check you did yourself, such as a video call. Documents members send are reviewed under ID checks."
        actions={
          <Badge variant={KYC_VARIANT[current]}>
            <span className="sr-only">Currently </span>
            {currentLabel.charAt(0).toUpperCase() + currentLabel.slice(1)}
          </Badge>
        }
      />
      <CardBody>
        {!canSet ? (
          <p className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-muted">
            <LockIcon
              aria-hidden="true"
              className={`mt-1 size-3.5 shrink-0 ${iconText(LockIcon)}`}
            />
            <span>{blockedBecause ?? "You cannot change this."}</span>
          </p>
        ) : (
          <>
            <fieldset className="min-w-0" disabled={pending || armed}>
              <legend className="sr-only">New identity status</legend>
              <Choices>
                {KYC_CHOICES.filter((choice) => choice.status !== current).map(
                  (choice) => (
                    <Choice
                      key={choice.status}
                      name={`kyc-${userId}`}
                      value={choice.status}
                      checked={status === choice.status}
                      locked={pending || armed}
                      onSelect={() => {
                        setStatus(choice.status);
                        setError(null);
                        setNote(null);
                      }}
                      title={choice.label}
                      // Both halves in sight: what follows from a status —
                      // who sees their page, what it does not touch — is a
                      // consequence, not background.
                      detail={`${choice.meaning} ${choice.more}`}
                    />
                  ),
                )}
              </Choices>
            </fieldset>

            {armed ? (
              <Well className="mt-3">
                <p className="font-medium">
                  Mark their identity{" "}
                  <strong className="font-semibold">
                    {chosen?.label.toLowerCase()}
                  </strong>
                  ? It is recorded against your name with the reason you gave.
                </p>
                {chosen ? (
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
                    {chosen.more}
                  </p>
                ) : null}
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
                    <Swap
                      busy={pending}
                      idle={`Yes — mark ${chosen?.label.toLowerCase()}`}
                      working="Saving…"
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
                  className="mt-4"
                  required
                />
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending || !reasonReady}
                    onClick={() => {
                      setError(null);
                      setNote(null);
                      setArmed(true);
                    }}
                  >
                    Continue
                  </Button>
                  <ReasonHint ready={reasonReady} />
                </div>
              </>
            )}
          </>
        )}

        <Outcome note={note} error={error} />
      </CardBody>
    </Card>
  );
}

// -------------------------------------------------------- account recovery

/**
 * Getting a locked-out person back in, without a developer.
 *
 * Three ways people get stuck, and before this not one of them had a button:
 * the verification email never arrived (with no mail provider, it never
 * does, and an unverified account cannot make an offer); somebody might be in
 * their account; or the phone with their codes is gone. The first two are
 * here; the third — clearing a second factor — can turn a stolen password
 * into a working sign-in, so it lives in the danger zone instead.
 */
export function AccountRecovery({
  userId,
  emailVerified,
  sessions,
  canVerifyEmail,
  canEndSessions,
  endSessionsBlockedBecause,
}: {
  userId: string;
  emailVerified: boolean;
  sessions: number;
  /** Any staff, not on their own account. */
  canVerifyEmail: boolean;
  /** Any staff on a member; a superadmin on a colleague; never yourself. */
  canEndSessions: boolean;
  endSessionsBlockedBecause?: string;
}) {
  return (
    <Card>
      <CardHeader
        as="h2"
        title="Help them back in"
        // Who it is for is one tap away; that it is on the record stays.
        description="Each of these is recorded against your name."
        info="For somebody who is locked out or worried."
      />
      <div className="divide-y divide-line">
        <RecoveryStep
          title="Email address"
          status={emailVerified ? "Verified" : "Not verified"}
          statusTone={emailVerified ? "verified" : "danger"}
          // The check to make before pressing stays in view; why the
          // button exists sits behind the (i).
          body={
            emailVerified
              ? "Nothing to do."
              : "Confirm the address another way first — they wrote in from it, or you called them."
          }
          more={
            emailVerified
              ? undefined
              : "They cannot make an offer until this is verified, and the email that would do it may never arrive."
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
          // What the button does stays in view; when to use it is behind
          // the (i).
          body="Ends every session they have, on every device; their password still works."
          more="For somebody worried that someone else is in their account, or who signed in on a shared computer — where suspending would be far too much."
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
      </div>
    </Card>
  );
}

/** One remedy: what is true now, what pressing the button does, and the button. */
function RecoveryStep({
  title,
  status,
  statusTone = "neutral",
  body,
  more,
  action,
  blocked,
}: {
  title: string;
  status: string;
  statusTone?: "neutral" | "verified" | "danger";
  /** What is true now or what the button does, in one line. */
  body: string;
  /** Why somebody would reach for it, behind an (i) beside the name. */
  more?: string;
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
    <div className="px-4 py-4 sm:px-5">
      <StepHead
        title={title}
        info={more}
        status={<Badge variant={statusTone}>{status}</Badge>}
      />
      <p className={BODY}>{body}</p>
      {blocked ? (
        <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-subtle">
          <LockIcon aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
          <span>{blocked}</span>
        </p>
      ) : null}

      {action ? (
        armed ? (
          <Well className="mt-3">
            <p className="font-medium">{action.prompt}</p>
            <div className="mt-3 flex flex-wrap gap-2">
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
                <Swap busy={pending} idle={action.confirm} working="Working…" />
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3"
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

// ------------------------------------------------------------- danger zone

/**
 * The two things on this page that are hard to take back: suspending the
 * account, and clearing a lost second factor. Kept together, last, and
 * outlined in red, so neither is ever the nearest button to something
 * routine.
 */
export function DangerZone({
  userId,
  banned,
  holds,
  isSelf,
  twoFactorEnabled,
  canResetTwoFactor,
}: {
  userId: string;
  banned: boolean;
  /** Safest channels this person is holding right now. */
  holds: number;
  /** The server refuses a suspension of yourself; so does this card. */
  isSelf: boolean;
  twoFactorEnabled: boolean;
  /** Superadmin, not on their own account. */
  canResetTwoFactor: boolean;
}) {
  return (
    <Card tone="danger" className="bg-surface">
      <CardHeader as="h2" title="Danger zone" />
      <div className="divide-y divide-line">
        {isSelf ? null : (
          <Suspension userId={userId} banned={banned} holds={holds} />
        )}
        <TwoFactorReset
          userId={userId}
          enabled={twoFactorEnabled}
          canReset={canResetTwoFactor}
        />
      </div>
    </Card>
  );
}

/** Taking the account away, or giving it back. */
function Suspension({
  userId,
  banned,
  holds,
}: {
  userId: string;
  banned: boolean;
  holds: number;
}) {
  const reasonId = useId();
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
    <div className="px-4 py-4 sm:px-5">
      <StepHead
        title={banned ? "Suspension" : "Suspend this account"}
        status={banned ? <Badge variant="danger">Suspended</Badge> : null}
      />

      {banned ? (
        <>
          <p className={BODY}>
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
            <Swap busy={pending} idle="Restore access" working="Restoring…" />
          </Button>
        </>
      ) : armed ? (
        <Well tone="danger" className="mt-3">
          <p className="flex items-start gap-2 font-medium">
            <TriangleAlertIcon
              aria-hidden="true"
              className="mt-1 size-3.5 shrink-0 text-danger"
            />
            <span>
              This signs them out of every session, blocks sign-in, and pauses
              every live listing they have. They are shown the reason you typed.
            </span>
          </p>
          {holds > 0 ? (
            <p className="mt-2 flex items-start gap-2 font-medium text-danger">
              <TriangleAlertIcon
                aria-hidden="true"
                className="mt-1 size-3.5 shrink-0"
              />
              <span>
                They are holding {holds} {holds === 1 ? "channel" : "channels"}{" "}
                as an agent. Suspending them does not return those: the channels
                stay in this account&rsquo;s custody until a deal is reassigned
                or returned to its seller.
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
              <Swap
                busy={pending}
                idle="Yes — suspend the account"
                working="Suspending…"
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
        <>
          <p className={BODY}>
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
            className="mt-3"
            required
          />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={DANGER_OUTLINE}
              disabled={pending || !reasonReady}
              onClick={() => {
                setError(null);
                setNote(null);
                setArmed(true);
              }}
            >
              Continue
            </Button>
            <ReasonHint ready={reasonReady} />
          </div>
        </>
      )}

      <Outcome note={note} error={error} />
    </div>
  );
}

/**
 * Clearing a lost second factor.
 *
 * Its own component because it is the one remedy that asks for a reason, and
 * the one that is red: whoever can press it can turn a stolen password into a
 * working sign-in.
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
    <div className="px-4 py-4 sm:px-5">
      <StepHead
        title="Two-step verification"
        status={
          <Badge variant={enabled ? "verified" : "neutral"}>
            {enabled ? "On" : "Off"}
          </Badge>
        }
      />
      <p className={BODY}>
        {enabled
          ? "If they have lost the device their codes are on, this turns it off so they can sign in with their password and set up a new one."
          : "Nothing to reset. Only they can turn it on, under Security."}
      </p>

      {enabled && !canReset ? (
        <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-subtle">
          <LockIcon aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
          <span>
            Only a superadmin can reset this, and nobody can reset their own.
          </span>
        </p>
      ) : null}

      {enabled && canReset ? (
        armed ? (
          <Well tone="danger" className="mt-3">
            <p className="flex items-start gap-2 font-medium">
              <TriangleAlertIcon
                aria-hidden="true"
                className="mt-1 size-3.5 shrink-0 text-danger"
              />
              <span>
                Anyone with their password can then sign in as them. Only do
                this once you are sure the person asking is the account holder.
                It also signs them out everywhere.
              </span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
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
                <Swap
                  busy={pending}
                  idle="Yes — reset two-step verification"
                  working="Resetting…"
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
              className="mt-3"
              required
            />
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={DANGER_OUTLINE}
                disabled={pending || !reasonReady}
                onClick={() => {
                  setNote(null);
                  setError(null);
                  setArmed(true);
                }}
              >
                Continue
              </Button>
              <ReasonHint ready={reasonReady} />
            </div>
          </>
        )
      ) : null}

      <Outcome note={note} error={error} />
    </div>
  );
}
