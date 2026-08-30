"use server";

import { revalidatePath } from "next/cache";
import * as repo from "@/server/admin-listings";
import { recordAudit } from "@/server/audit";
import { requireRole } from "@/server/session";

/**
 * Moderator actions on listings.
 *
 * Three things hold across all of them:
 *
 * 1. `requireRole` runs first and throws before any work happens. It is not a
 *    UI concern — the admin pages hide these controls, but hiding a button is
 *    not access control.
 * 2. Every action writes an audit row naming the actor. A moderation decision
 *    that nobody can be held to is not a decision.
 * 3. Rejecting and removing both demand a reason. The seller sees it, so
 *    "no" without a reason is not an available option.
 */

export type AdminResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const NOT_FOUND = {
  ok: false as const,
  error: "That listing no longer exists.",
};
const WRONG_STATUS = {
  ok: false as const,
  error: "Someone else has already dealt with this one. Reload the queue.",
};

function refresh(id: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/listings");
  revalidatePath(`/admin/listings/${id}`);
  // A decision changes what buyers see.
  revalidatePath("/browse");
  revalidatePath("/");
}

export async function approveListing(id: string): Promise<AdminResult> {
  const actor = await requireRole("MODERATOR");

  const result = await repo.approveListing(id);
  if (!result.ok) {
    return result.reason === "not-found" ? NOT_FOUND : WRONG_STATUS;
  }

  await recordAudit({
    actorId: actor.id,
    action: "listing.approve",
    entity: "listing",
    entityId: id,
    before: { status: result.before },
    after: { status: result.after },
  });

  refresh(id);
  revalidatePath(`/listing/${result.slug}`);
  return { ok: true, message: "Approved. It is live now." };
}

export async function rejectListing(
  id: string,
  reason: string,
): Promise<AdminResult> {
  const actor = await requireRole("MODERATOR");

  const result = await repo.rejectListing(id, reason);
  if (!result.ok) {
    if (result.reason === "reason-too-short") {
      return {
        ok: false,
        error:
          "Say what needs fixing — the seller sees this and has to act on it.",
      };
    }
    return result.reason === "not-found" ? NOT_FOUND : WRONG_STATUS;
  }

  await recordAudit({
    actorId: actor.id,
    action: "listing.reject",
    entity: "listing",
    entityId: id,
    before: { status: result.before },
    after: { status: result.after, reason: reason.trim() },
  });

  refresh(id);
  return { ok: true, message: "Sent back to the seller." };
}

export async function removeListing(
  id: string,
  reason: string,
): Promise<AdminResult> {
  const actor = await requireRole("MODERATOR");

  const result = await repo.removeListing(id, reason);
  if (!result.ok) {
    if (result.reason === "reason-too-short") {
      return { ok: false, error: "Record why this is coming down." };
    }
    if (result.reason === "wrong-status") {
      return {
        ok: false,
        error:
          "This listing has money against it. Handle it through the order instead.",
      };
    }
    return NOT_FOUND;
  }

  await recordAudit({
    actorId: actor.id,
    action: "listing.remove",
    entity: "listing",
    entityId: id,
    before: { status: result.before },
    after: { status: result.after, reason: reason.trim() },
  });

  refresh(id);
  return { ok: true, message: "Taken down." };
}
