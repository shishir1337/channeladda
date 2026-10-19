import "server-only";

import { isCustodianRole } from "@/lib/custody-roles";
import { db } from "@/lib/db";
import { TERMINAL_STATUSES } from "@/lib/deal-machine";

/**
 * When the agent of a deal may be in its conversation.
 *
 * Its own module because two others need it and need each other — the
 * thread itself (`@/server/messages`) and the attachment guard
 * (`@/server/upload-access`) — and neither should import the other for it.
 */

/** The deals in a thread an agent is running: assigned, and not finished. */
export function runningDealsOf(agentId: string) {
  return {
    some: { agentId, status: { notIn: [...TERMINAL_STATUSES] } },
  };
}

/**
 * Whether this agent may read and write in this conversation.
 *
 * An agent is staff for the deals they are assigned to, not for the
 * platform, so: only while they are the agent on a deal in this thread that
 * is still running. A dispute is still running — they may need to answer it.
 * Reassigned, moved to another role, banned, or the deal over: no longer,
 * and that includes anything said afterwards about a later deal here, which
 * may have another agent. Role and ban are read from the database rather than
 * the session, as `roleOnDeal` does, so a desk taken away is gone at once.
 *
 * One rule, for the thread, posting, the poll, attachments and the inbox.
 */
export async function agentOnThread(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  if (!(await stillAnAgent(userId))) return false;
  const running = await db.conversation.count({
    where: { id: conversationId, orders: runningDealsOf(userId) },
  });
  return running > 0;
}

/**
 * Holds a role that runs deals — agent, moderator or superadmin — and is not
 * banned, by the database's account.
 */
export async function stillAnAgent(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, bannedAt: true },
  });
  return Boolean(user && isCustodianRole(user.role) && !user.bannedAt);
}
