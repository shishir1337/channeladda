"use server";

import { revalidatePath } from "next/cache";
import type { DealLevel, KycStatus, UserRole } from "@/generated/prisma/enums";
import { DEAL_LEVELS, levelLabel } from "@/lib/custody-roles";
import * as repo from "@/server/admin-users";
import { recordAudit } from "@/server/audit";
import { requireRole, requireStaff, requireSuperadmin } from "@/server/session";

/**
 * Staff acting on accounts.
 *
 * Role changes are superadmin-only and suspensions are rank-checked inside the
 * repository, so neither gate depends on which buttons the page happened to
 * draw. Both write to the audit trail before returning: "who banned this
 * seller and why" is the first question asked when a suspension is disputed.
 *
 * `acceptInvite` at the bottom is the one export with no role check, and it
 * says why. Everything else in this file starts with one.
 */

export type AdminUserActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const FAILURES: Record<repo.GuardFailure, string> = {
  "not-found": "That account no longer exists.",
  self: "You cannot do that to your own account.",
  "last-superadmin":
    "This is the last superadmin who can still sign in. Appoint another one first, or the platform is left with nobody who can set fees or manage staff.",
  outranked: "Only a superadmin can do that to a staff account.",
  "no-change": "That is already the case.",
  "not-an-agent":
    "Only somebody who runs deals — an agent, a moderator or the superadmin — has a transfer identity or a deal level.",
};

export async function setUserRole(
  userId: string,
  role: UserRole,
): Promise<AdminUserActionResult> {
  const actor = await requireSuperadmin();

  if (!repo.ROLES.includes(role)) {
    return { ok: false, error: "That is not a role." };
  }

  const result = await repo.setUserRole({
    actorId: actor.id,
    userId,
    role,
  });
  if (!result.ok) return { ok: false, error: FAILURES[result.reason] };

  await recordAudit({
    actorId: actor.id,
    action: "user.role",
    entity: "user",
    entityId: userId,
    before: result.before,
    after: result.after,
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin/team");
  revalidatePath(`/admin/users/${userId}`);
  return {
    ok: true,
    // Only the removal case can promise the sign-out: anyone losing a role
    // had one, and `setUserRole` ends their sessions. A plain member being
    // promoted keeps theirs, so saying so here would be wrong half the time.
    message:
      role === "USER"
        ? "Access removed. They have been signed out of every session."
        : `Now a ${repo.ROLE_LABELS[role].toLowerCase()}.`,
  };
}

export async function setUserBanned(
  userId: string,
  banned: boolean,
  reason: string,
): Promise<AdminUserActionResult> {
  const actor = await requireStaff();

  const trimmed = reason.trim();
  if (banned && trimmed.length < 4) {
    return {
      ok: false,
      error:
        "Say why. The reason is shown to them and kept in the audit trail.",
    };
  }

  const result = await repo.setUserBanned({
    actorId: actor.id,
    actorRole: actor.role,
    userId,
    banned,
    reason: banned ? trimmed : null,
  });
  if (!result.ok) return { ok: false, error: FAILURES[result.reason] };

  await recordAudit({
    actorId: actor.id,
    action: banned ? "user.suspend" : "user.restore",
    entity: "user",
    entityId: userId,
    before: result.before,
    after: banned ? trimmed : false,
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin/team");
  revalidatePath(`/admin/users/${userId}`);
  return {
    ok: true,
    message: banned
      ? "Suspended. They have been signed out and their live listings are paused."
      : "Restored. They can sign in again; their listings stay paused until they relist.",
  };
}

/** The same floor a suspension has always had. */
const MIN_REASON = 4;

function refreshUser(userId: string) {
  revalidatePath("/admin/users");
  revalidatePath("/admin/team");
  revalidatePath(`/admin/users/${userId}`);
}

// ---------------------------------------------------------- staff remedies

const KYC_WORDS: Record<KycStatus, string> = {
  NOT_STARTED: "not started",
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};

/**
 * Record an identity check done off-platform.
 *
 * MODERATOR and SUPERADMIN, the same desk that reviews listings — it is the
 * same judgement, about the same people. The reason is required and kept,
 * because "who approved this seller, on what evidence" is the question asked
 * after one of them turns out not to be who they said.
 */
export async function setUserKyc(
  userId: string,
  status: KycStatus,
  reason: string,
): Promise<AdminUserActionResult> {
  const actor = await requireRole("MODERATOR");

  if (!repo.KYC_SETTABLE.includes(status)) {
    return { ok: false, error: "That is not a status staff can set." };
  }
  const trimmed = reason.trim();
  if (trimmed.length < MIN_REASON) {
    return {
      ok: false,
      error: "Say what you checked. It is kept in the audit trail.",
    };
  }

  const result = await repo.setKycStatus({
    actorId: actor.id,
    actorRole: actor.role,
    userId,
    status,
    reason: trimmed,
  });
  if (!result.ok) return { ok: false, error: FAILURES[result.reason] };

  await recordAudit({
    actorId: actor.id,
    action: "user.kyc",
    entity: "user",
    entityId: userId,
    before: result.before,
    after: { status: result.after, reason: trimmed },
  });

  refreshUser(userId);
  // The public directory and the homepage's top sellers both filter on this.
  revalidatePath("/sellers");
  revalidatePath("/");
  return {
    ok: true,
    message:
      status === "APPROVED"
        ? "Identity approved. If they have a seller page, it can now appear in the public directory."
        : `Identity check now ${KYC_WORDS[status]}.`,
  };
}

/**
 * Clear somebody's second factor after they lost the device it was on.
 *
 * SUPERADMIN only: whoever can do this can turn a stolen password into a
 * working sign-in, so it sits with the role that is already trusted with
 * everything else. Reason required, because the one thing worth knowing
 * afterwards is how the person asking proved who they were.
 */
export async function resetUserTwoFactor(
  userId: string,
  reason: string,
): Promise<AdminUserActionResult> {
  const actor = await requireSuperadmin();

  const trimmed = reason.trim();
  if (trimmed.length < MIN_REASON) {
    return {
      ok: false,
      error:
        "Say how they proved it was them. That is the question this gets asked later.",
    };
  }

  const result = await repo.resetTwoFactor({ actorId: actor.id, userId });
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "no-change"
          ? "Two-step verification is not on for this account."
          : FAILURES[result.reason],
    };
  }

  await recordAudit({
    actorId: actor.id,
    action: "user.two_factor_reset",
    entity: "user",
    entityId: userId,
    before: true,
    after: {
      twoFactor: false,
      reason: trimmed,
      sessionsEnded: result.sessionsEnded,
    },
  });

  refreshUser(userId);
  return {
    ok: true,
    message:
      "Two-step verification is off and they have been signed out everywhere. They sign in with their password and can set up a new device under Security.",
  };
}

/**
 * Confirm somebody's email address by hand. Any staff desk — it unblocks a
 * buyer and takes nothing from anyone.
 */
export async function verifyUserEmail(
  userId: string,
): Promise<AdminUserActionResult> {
  const actor = await requireStaff();

  const result = await repo.markEmailVerified({ actorId: actor.id, userId });
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "no-change"
          ? "That address is already verified."
          : FAILURES[result.reason],
    };
  }

  await recordAudit({
    actorId: actor.id,
    action: "user.email_verified",
    entity: "user",
    entityId: userId,
    before: false,
    after: { email: result.email, by: "staff" },
  });

  refreshUser(userId);
  return {
    ok: true,
    message: "Email marked verified. They can make offers now.",
  };
}

/** Sign somebody out of every device, short of suspending them. */
export async function signOutEverywhere(
  userId: string,
): Promise<AdminUserActionResult> {
  const actor = await requireStaff();

  const result = await repo.endSessions({
    actorId: actor.id,
    actorRole: actor.role,
    userId,
  });
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "no-change"
          ? "They are not signed in anywhere."
          : FAILURES[result.reason],
    };
  }

  await recordAudit({
    actorId: actor.id,
    action: "user.sessions_ended",
    entity: "user",
    entityId: userId,
    after: { ended: result.ended },
  });

  refreshUser(userId);
  return {
    ok: true,
    message: `Signed out of ${result.ended} ${result.ended === 1 ? "session" : "sessions"}. Their password still works.`,
  };
}

// --------------------------------------------------------- agent identity

/**
 * The address a seller is told to invite as channel owner.
 *
 * Superadmin-only, like a role change and for the same reason: it decides who
 * a seller hands a channel to. Getting it wrong does not fail loudly — the
 * invitation simply reaches nobody, and the deal sits in AWAITING_CUSTODY
 * while everyone waits for someone else.
 */
export async function setAgentIdentity(
  userId: string,
  email: string,
  brand: string,
): Promise<AdminUserActionResult> {
  const actor = await requireSuperadmin();

  const trimmedEmail = email.trim().toLowerCase();
  const trimmedBrand = brand.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return { ok: false, error: "That is not an email address." };
  }
  if (trimmedBrand.length < 2) {
    return {
      ok: false,
      error: "Give the name the seller sees beside the address.",
    };
  }

  const result = await repo.setAgentIdentity({
    userId,
    email: trimmedEmail,
    brand: trimmedBrand,
  });
  if (!result.ok) return { ok: false, error: FAILURES[result.reason] };

  await recordAudit({
    actorId: actor.id,
    action: "user.agent_identity",
    entity: "user",
    entityId: userId,
    before: result.before,
    after: result.after,
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin/team");
  revalidatePath(`/admin/users/${userId}`);
  return {
    ok: true,
    message: `New deals will tell sellers to invite ${trimmedEmail}.`,
  };
}

/**
 * The same, set by the person themselves: an agent or moderator changing the
 * address they take channels on, without asking the superadmin to.
 *
 * Applies to deals they take from now on. A deal already running keeps the
 * address its seller was given, who may have sent the invite already.
 */
export async function setMyAgentIdentity(
  email: string,
  brand: string,
): Promise<AdminUserActionResult> {
  // The superadmin passes every requireRole too.
  const me = await requireRole("AGENT", "MODERATOR");

  const trimmedEmail = email.trim().toLowerCase();
  const trimmedBrand = brand.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return { ok: false, error: "That is not an email address." };
  }
  if (trimmedBrand.length < 2) {
    return {
      ok: false,
      error: "Give the name the seller sees beside the address.",
    };
  }

  const result = await repo.setAgentIdentity({
    userId: me.id,
    email: trimmedEmail,
    brand: trimmedBrand,
  });
  if (!result.ok) return { ok: false, error: FAILURES[result.reason] };

  await recordAudit({
    actorId: me.id,
    action: "user.agent_identity_self",
    entity: "user",
    entityId: me.id,
    before: result.before,
    after: result.after,
  });

  revalidatePath("/dashboard/security");
  revalidatePath("/admin/team");
  return {
    ok: true,
    message: `Saved. Sellers on deals you take from now on invite ${trimmedEmail}.`,
  };
}

/**
 * Which deals somebody may run, by agreed price. Superadmin-only, like
 * a role: it decides who holds which channels.
 */
export async function setDealLevel(
  userId: string,
  level: DealLevel | null,
): Promise<AdminUserActionResult> {
  const actor = await requireSuperadmin();
  if (level !== null && !DEAL_LEVELS.includes(level)) {
    return { ok: false, error: "Pick one of the three levels." };
  }

  const result = await repo.setDealLevel({ userId, level });
  if (!result.ok) return { ok: false, error: FAILURES[result.reason] };

  await recordAudit({
    actorId: actor.id,
    action: "user.deal_level",
    entity: "user",
    entityId: userId,
    before: { dealLevel: result.before },
    after: { dealLevel: result.after },
  });

  revalidatePath("/admin/team");
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/deals");
  return {
    ok: true,
    message: `Now ${levelLabel(level).toLowerCase()}. Deals they already run are not affected.`,
  };
}

// ------------------------------------------------------------- invitations

export type InviteResult =
  | {
      ok: true;
      message: string;
      /**
       * The invitation link. Shown once, in this response, and nowhere else:
       * the database holds only a fingerprint of the token, so there is no
       * way to produce this again — a lost link is re-invited, not recovered.
       */
      link: string;
      email: string;
    }
  | { ok: false; error: string };

const INVITE_FAILURES: Record<repo.CreateInviteFailure, string> = {
  "bad-email": "That is not an email address.",
  "not-invitable":
    "Members do not need an invitation — they can sign themselves up.",
  "account-exists":
    "That address already has an account. Open it from People and change their role instead.",
};

/**
 * Invite a teammate.
 *
 * The link is built against the configured base URL rather than from the
 * request, so a superadmin working through a preview deployment cannot
 * accidentally hand out a link that only works on that preview.
 */
export async function inviteTeammate(
  email: string,
  role: UserRole,
): Promise<InviteResult> {
  const actor = await requireSuperadmin();

  const result = await repo.createStaffInvite({
    actorId: actor.id,
    email,
    role,
  });
  if (!result.ok) return { ok: false, error: INVITE_FAILURES[result.reason] };

  await recordAudit({
    actorId: actor.id,
    action: "staff.invited",
    entity: "user",
    // No account exists yet, so the invitation is the thing that happened.
    // Invite ids and user ids never collide, so a later lookup of this
    // person's own trail is unaffected.
    entityId: result.id,
    after: {
      email: result.email,
      role: result.role,
      expiresAt: result.expiresAt.toISOString(),
      replacedOutstanding: result.replaced,
    },
  });

  revalidatePath("/admin/team");

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return {
    ok: true,
    email: result.email,
    link: `${base.replace(/\/$/, "")}/invite?token=${result.token}`,
    message:
      result.replaced > 0
        ? `Invited as ${repo.ROLE_LABELS[result.role].toLowerCase()}. The earlier link for this address no longer works.`
        : `Invited as ${repo.ROLE_LABELS[result.role].toLowerCase()}.`,
  };
}

export async function revokeInvite(
  inviteId: string,
): Promise<AdminUserActionResult> {
  const actor = await requireSuperadmin();

  const result = await repo.revokeStaffInvite({
    actorId: actor.id,
    inviteId,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: "That invitation has already been used or withdrawn.",
    };
  }

  await recordAudit({
    actorId: actor.id,
    action: "staff.invite_revoked",
    entity: "user",
    entityId: inviteId,
    after: { email: result.email, role: result.role },
  });

  revalidatePath("/admin/team");
  return { ok: true, message: `The link for ${result.email} is now dead.` };
}

/**
 * Accepting an invitation. **Deliberately ungated.**
 *
 * The only export in this file that does not start with a role check, and the
 * only one that must not: it is called by somebody who has no account yet.
 * The token is the authorisation — single use, expiring, revocable, and it can
 * only ever produce the address and role a superadmin already wrote down.
 *
 * Every refusal is the same sentence on purpose. Expired, withdrawn, already
 * used and never existed are four different facts, and an anonymous caller
 * being told which one they hit is a guessing oracle.
 */
export async function acceptInvite(
  token: string,
  name: string,
  password: string,
): Promise<AdminUserActionResult> {
  const result = await repo.acceptStaffInvite({ token, name, password });

  if (!result.ok) {
    const errors: Record<repo.AcceptInviteFailure, string> = {
      "bad-token":
        "This invitation cannot be used. It may have expired, been withdrawn, or already been accepted. Ask whoever invited you for a new link.",
      "no-name": "Enter the name your colleagues will see.",
      "weak-password": `Use at least ${repo.MIN_STAFF_PASSWORD} characters. This account can move money or appoint staff.`,
      "account-exists":
        "That address already has an account. Sign in instead, and ask a superadmin to grant the role.",
    };
    return { ok: false, error: errors[result.reason] };
  }

  await recordAudit({
    // Them, not the inviter: they are the one who did this.
    actorId: result.userId,
    action: "staff.invite_accepted",
    entity: "user",
    entityId: result.userId,
    after: { email: result.email, role: result.role },
  });

  // No revalidatePath here. A revalidation from an action re-renders the page
  // it was called from — the invite page — which then found the token used
  // and swapped "Your account is ready" for "This invitation cannot be used",
  // so every new teammate was told their invitation had failed. The team and
  // people pages render on every request; there is nothing cached to clear.
  return {
    ok: true,
    message: `Your account is ready as ${repo.ROLE_LABELS[result.role].toLowerCase()}.`,
  };
}
