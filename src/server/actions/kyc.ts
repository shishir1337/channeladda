"use server";

import { revalidatePath } from "next/cache";
import {
  KYC_REASON_MAX,
  KYC_REASON_MIN,
  type KycErrors,
  type KycFields,
  parseKyc,
} from "@/lib/kyc";
import { recordAudit } from "@/server/audit";
import { type DecideFailure, decideKyc, submitKyc } from "@/server/kyc";
import { notifyStaff } from "@/server/notifications";
import { requireRole, requireUser } from "@/server/session";

/**
 * Getting verified, from both sides: a member sending an ID check, and a
 * moderator deciding it.
 *
 * Every audit row here records the decision and never a file: no document or
 * video URL goes into `before`/`after`, a notification or an email.
 */

export type SubmitKycResult =
  | { ok: true; message: string }
  | { ok: false; error?: string; errors?: KycErrors };

export async function submitVerification(
  fields: KycFields,
): Promise<SubmitKycResult> {
  const user = await requireUser("/dashboard/verification");

  const parsed = parseKyc(fields);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const result = await submitKyc(user.id, parsed.value);
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "pending"
          ? "We are already checking your documents. You can send them again only if this check is not approved."
          : result.reason === "approved"
            ? "You are already verified."
            : "One of your files did not upload properly. Add the photos and the video again, then send.",
    };
  }

  await recordAudit({
    actorId: user.id,
    action: "kyc.submit",
    entity: "kyc",
    entityId: result.submissionId,
    after: {
      status: "PENDING",
      documentType: parsed.value.documentType,
      attempt: result.attempts,
    },
  });

  // One unread row per moderator however many arrive, like a thread: the
  // queue count in the staff nav says how many.
  await notifyStaff(["MODERATOR"], (staffId) => ({
    userId: staffId,
    kind: "IDENTITY",
    title: "An ID check is waiting",
    body: "A member sent their ID for the Verified badge.",
    href: "/admin/verification",
    collapseKey: "kyc-queue",
  }));

  revalidatePath("/dashboard/verification");
  revalidatePath("/dashboard/profile");
  revalidatePath("/admin/verification");
  return {
    ok: true,
    message: "Sent. We'll tell you here and by email when it's checked.",
  };
}

export type DecideKycResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const FAILURES: Record<DecideFailure, string> = {
  "not-found": "That check no longer exists.",
  self: "Nobody decides their own ID check. Ask another moderator.",
  "last-superadmin": "That cannot be done.",
  outranked: "Only a superadmin can decide a staff member's ID check.",
  "no-change": "Someone has already decided this one.",
  "not-an-agent": "That cannot be done.",
  decided: "Someone has already decided this one.",
  "reason-too-short": `Say what to fix in a few words (at least ${KYC_REASON_MIN} characters). They read it word for word.`,
  "reason-too-long": `Keep it under ${KYC_REASON_MAX} characters.`,
};

function refresh(userId: string, slug: string | null, submissionId: string) {
  revalidatePath("/admin/verification");
  revalidatePath(`/admin/verification/${submissionId}`);
  revalidatePath(`/admin/users/${userId}`);
  // The badge and the sellers directory, which lists approved sellers only.
  revalidatePath("/sellers");
  revalidatePath("/");
  if (slug) revalidatePath(`/seller/${slug}`);
}

/** MODERATOR and SUPERADMIN only: `requireRole` lets the superadmin through. */
export async function approveVerification(
  submissionId: string,
): Promise<DecideKycResult> {
  const actor = await requireRole("MODERATOR");

  const result = await decideKyc({
    actorId: actor.id,
    actorRole: actor.role,
    submissionId,
    approve: true,
  });
  if (!result.ok) return { ok: false, error: FAILURES[result.reason] };

  await recordAudit({
    actorId: actor.id,
    action: "kyc.approve",
    entity: "kyc",
    entityId: submissionId,
    before: { status: result.before },
    after: { status: result.after, userId: result.userId },
  });

  refresh(result.userId, result.slug, submissionId);
  return {
    ok: true,
    message: "Approved. The Verified badge shows beside their name now.",
  };
}

export async function rejectVerification(
  submissionId: string,
  reason: string,
): Promise<DecideKycResult> {
  const actor = await requireRole("MODERATOR");

  const result = await decideKyc({
    actorId: actor.id,
    actorRole: actor.role,
    submissionId,
    approve: false,
    reason,
  });
  if (!result.ok) return { ok: false, error: FAILURES[result.reason] };

  await recordAudit({
    actorId: actor.id,
    action: "kyc.reject",
    entity: "kyc",
    entityId: submissionId,
    before: { status: result.before },
    after: {
      status: result.after,
      userId: result.userId,
      reason: result.reason,
    },
  });

  refresh(result.userId, result.slug, submissionId);
  return {
    ok: true,
    message: "Sent back. They have been told why and can try again.",
  };
}
