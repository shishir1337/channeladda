"use server";

import { revalidatePath } from "next/cache";
import { MAX_MESSAGE } from "@/lib/messages";
import { ESCROW_AGENT_HREF, SUPPORT_CHATS_HREF } from "@/lib/support-chat";
import type { MessageActionResult } from "@/server/actions/messages";
import { requireRole, requireUser } from "@/server/session";
import {
  replyToSupportChat,
  type SupportSendFailure,
  sendToEscrowAgent,
} from "@/server/support-chat";

/**
 * The two ways a line reaches an Escrow Agent chat. Each re-reads the
 * session; the repository re-checks everything else, including the staff
 * role from the database.
 */

function errorFor(reason: SupportSendFailure): string {
  switch (reason) {
    case "empty":
      return "Write something first.";
    case "too-long":
      return `Keep it under ${MAX_MESSAGE.toLocaleString("en-US")} characters.`;
    case "bad-attachment":
      return "That attachment could not be used. Pick the file again.";
    case "rate":
      return "That is a lot in one minute. Wait a moment, then send again.";
    case "not-allowed":
      return "You cannot write in this chat.";
  }
}

/** A member writes to the Escrow Agent. Makes their chat the first time. */
export async function postToEscrowAgent(
  body: string,
  /** A key this app stored, not a URL. See `sendMessage`. */
  attachmentKey?: string,
): Promise<MessageActionResult> {
  const member = await requireUser(ESCROW_AGENT_HREF);
  const result = await sendToEscrowAgent({ member, body, attachmentKey });
  if (!result.ok) return { ok: false, error: errorFor(result.reason) };

  revalidatePath(ESCROW_AGENT_HREF);
  revalidatePath("/dashboard/messages");
  revalidatePath(SUPPORT_CHATS_HREF);
  revalidatePath(`${SUPPORT_CHATS_HREF}/${result.threadId}`);
  return { ok: true, note: null };
}

/** An agent replies. Bound to the chat's id by the desk's page. */
export async function replyToSupport(
  threadId: string,
  body: string,
  attachmentKey?: string,
): Promise<MessageActionResult> {
  const staff = await requireRole("AGENT", "MODERATOR", "FINANCE");
  const result = await replyToSupportChat({
    threadId,
    staff,
    body,
    attachmentKey,
  });
  if (!result.ok) return { ok: false, error: errorFor(result.reason) };

  revalidatePath(SUPPORT_CHATS_HREF);
  revalidatePath(`${SUPPORT_CHATS_HREF}/${threadId}`);
  revalidatePath(ESCROW_AGENT_HREF);
  return { ok: true, note: null };
}
