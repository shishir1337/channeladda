"use server";

import { revalidatePath } from "next/cache";
import * as repo from "@/server/admin-disputes";
import { requireStaff } from "@/server/session";

/**
 * Writing on the record of a dispute.
 *
 * `requireStaff` runs first and throws before any work happens: MODERATOR,
 * FINANCE and SUPERADMIN, and not AGENT — the same desks the page admits. The
 * repository checks the role again from the database, so a session that went
 * stale after a demotion is refused there as well.
 */

export type DisputeNoteResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const MESSAGES: Record<repo.DisputeNoteFailure, string> = {
  "too-short": `Write at least ${repo.MIN_DISPUTE_NOTE} characters — this is what the decision is made from.`,
  "too-long": `Keep it under ${repo.MAX_DISPUTE_NOTE.toLocaleString("en-US")} characters. Add a second note if there is more.`,
  "not-staff": "Only the dispute desks can add to the record.",
  "not-found": "That deal no longer exists.",
  "not-disputed":
    "This deal has already been decided, so the record is closed. Reload the desk.",
};

export async function addDisputeNote(
  orderId: string,
  note: string,
): Promise<DisputeNoteResult> {
  const staff = await requireStaff();

  const result = await repo.addDisputeNote({
    orderId,
    byUserId: staff.id,
    note,
  });
  if (!result.ok) return { ok: false, error: MESSAGES[result.reason] };

  revalidatePath("/admin/disputes");
  return { ok: true, message: "Added to the record." };
}
