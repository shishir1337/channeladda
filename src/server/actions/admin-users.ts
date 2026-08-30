"use server";

import { revalidatePath } from "next/cache";
import type { UserRole } from "@/generated/prisma/enums";
import * as repo from "@/server/admin-users";
import { recordAudit } from "@/server/audit";
import { requireStaff, requireSuperadmin } from "@/server/session";

/**
 * Staff acting on accounts.
 *
 * Role changes are superadmin-only and suspensions are rank-checked inside the
 * repository, so neither gate depends on which buttons the page happened to
 * draw. Both write to the audit trail before returning: "who banned this
 * seller and why" is the first question asked when a suspension is disputed.
 */

export type AdminUserActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const FAILURES: Record<repo.GuardFailure, string> = {
  "not-found": "That account no longer exists.",
  self: "You cannot do that to your own account.",
  "last-superadmin":
    "This is the last superadmin. Appoint another one first, or the platform is left with nobody who can set fees or manage staff.",
  outranked: "Only a superadmin can suspend a staff account.",
  "no-change": "That is already the case.",
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
  revalidatePath(`/admin/users/${userId}`);
  return {
    ok: true,
    message: `Now a ${repo.ROLE_LABELS[role].toLowerCase()}.`,
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
  revalidatePath(`/admin/users/${userId}`);
  return {
    ok: true,
    message: banned
      ? "Suspended. They have been signed out and their live listings are paused."
      : "Restored. They can sign in again; their listings stay paused until they relist.",
  };
}
