"use server";

import { revalidatePath } from "next/cache";
import { REPORT_REASONS, type ReportReason } from "@/lib/reports";
import { recordAudit } from "@/server/audit";
import * as repo from "@/server/reports";
import { requireStaff, requireUser } from "@/server/session";

export type ReportActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/** A buyer flags a listing. */
export async function reportListing(
  listingId: string,
  reason: string,
  detail: string,
): Promise<ReportActionResult> {
  const user = await requireUser();

  if (!REPORT_REASONS.includes(reason as ReportReason)) {
    return { ok: false, error: "Pick what is wrong with it." };
  }

  const result = await repo.reportListing({
    reporterId: user.id,
    listingId,
    reason,
    detail: detail.trim() || null,
  });

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "own-listing"
          ? "This is your own listing."
          : "That listing is no longer here.",
    };
  }

  revalidatePath("/admin");
  return {
    ok: true,
    message: result.already
      ? "You have already reported this one. A moderator will get to it."
      : "Reported. A moderator will look at it.",
  };
}

/** A moderator closes one off. */
export async function resolveReport(
  reportId: string,
): Promise<ReportActionResult> {
  const actor = await requireStaff();
  const result = await repo.resolveReport(reportId);
  if (!result.ok) {
    return { ok: false, error: "Someone else has already dealt with it." };
  }

  await recordAudit({
    actorId: actor.id,
    action: "report.resolve",
    entity: "listing",
    entityId: reportId,
    after: { resolved: true },
  });

  revalidatePath("/admin");
  return { ok: true, message: "Marked as handled." };
}
