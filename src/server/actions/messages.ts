"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/server/audit";
import * as repo from "@/server/messages";
import { requireStaff, requireUser } from "@/server/session";

/**
 * The only way a message gets written.
 *
 * Each of these re-reads the session rather than trusting anything the form
 * sent, and every one that touches a thread goes back through the repository,
 * which checks participation. A client that knows a conversation id still
 * cannot post to a thread it is not in.
 */

export type MessageActionResult =
  | { ok: true; note: string | null }
  | { ok: false; error: string };

export type StartResult =
  | { ok: true; conversationId: string }
  | { ok: false; error: string };

/** Ask a seller about a listing. Creates the thread the first time. */
export async function startConversation(
  listingId: string,
): Promise<StartResult> {
  const user = await requireUser();
  const result = await repo.openConversation({
    listingId,
    buyerId: user.id,
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

  revalidatePath("/dashboard/messages");
  return { ok: true, conversationId: result.id };
}

export async function postMessage(
  conversationId: string,
  body: string,
): Promise<MessageActionResult> {
  const user = await requireUser();
  const result = await repo.sendMessage({ conversationId, sender: user, body });

  if (!result.ok) {
    const errors = {
      empty: "Write something first.",
      "too-long": `Keep it under ${repo.MAX_MESSAGE.toLocaleString("en-US")} characters.`,
      closed: "This conversation has been closed by Channel Adda.",
      "not-allowed": "You are not part of this conversation.",
    } as const;
    return { ok: false, error: errors[result.reason] };
  }

  revalidatePath(`/dashboard/messages/${conversationId}`);
  revalidatePath("/dashboard/messages");
  revalidatePath(`/admin/messages/${conversationId}`);

  // Say what was removed and why. A message that silently arrives with holes
  // in it reads like a bug; one that explains itself reads like a rule.
  return {
    ok: true,
    note: result.redactedKinds.length
      ? `Sent, with ${result.redactedKinds.join(" and ")} removed. Deals stay on Channel Adda so escrow can protect them.`
      : null,
  };
}

export async function markThreadRead(conversationId: string) {
  const user = await requireUser();
  await repo.markThreadRead(conversationId, user);
  revalidatePath("/dashboard/messages");
}

/** A staff member takes ownership of a thread. */
export async function claimThread(
  conversationId: string,
): Promise<MessageActionResult> {
  const staff = await requireStaff();
  const result = await repo.claimThread(conversationId, staff.id);
  if (!result.ok) {
    return { ok: false, error: "Someone on the team already has this one." };
  }

  await recordAudit({
    actorId: staff.id,
    action: "conversation.claim",
    entity: "conversation",
    entityId: conversationId,
  });
  revalidatePath(`/admin/messages/${conversationId}`);
  revalidatePath("/admin/messages");
  return { ok: true, note: "You are handling this conversation." };
}

export async function clearThreadFlag(
  conversationId: string,
): Promise<MessageActionResult> {
  const staff = await requireStaff();
  await repo.clearThreadFlag(conversationId);
  await recordAudit({
    actorId: staff.id,
    action: "conversation.flag.clear",
    entity: "conversation",
    entityId: conversationId,
  });
  revalidatePath(`/admin/messages/${conversationId}`);
  revalidatePath("/admin/messages");
  return { ok: true, note: "Flag cleared." };
}

export async function setThreadClosed(
  conversationId: string,
  closed: boolean,
): Promise<MessageActionResult> {
  const staff = await requireStaff();
  await repo.setThreadClosed(conversationId, closed);
  await recordAudit({
    actorId: staff.id,
    action: closed ? "conversation.close" : "conversation.reopen",
    entity: "conversation",
    entityId: conversationId,
  });
  revalidatePath(`/admin/messages/${conversationId}`);
  revalidatePath("/admin/messages");
  revalidatePath(`/dashboard/messages/${conversationId}`);
  return {
    ok: true,
    note: closed ? "Conversation closed." : "Conversation reopened.",
  };
}
