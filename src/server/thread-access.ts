import "server-only";

import type { UserRole } from "@/generated/prisma/enums";
import { isCustodianRole } from "@/lib/custody-roles";
import { db } from "@/lib/db";
import { TERMINAL_STATUSES } from "@/lib/deal-machine";

/**
 * When the agent of a deal may be in its conversation, and how much of it
 * they may see.
 *
 * Its own module because others need it and need each other — the thread
 * itself (`@/server/messages`), the poll (`@/server/thread-fingerprint`)
 * and the attachment guard (`@/server/upload-access`) — and none of them
 * should import another for it.
 */

/** The deals in a thread an agent is running: assigned, and not finished. */
export function runningDealsOf(agentId: string) {
  return {
    some: { agentId, status: { notIn: [...TERMINAL_STATUSES] } },
  };
}

/** Channel Adda's own staff, who read every conversation whole. */
const STAFF_ROLES: UserRole[] = ["MODERATOR", "FINANCE", "SUPERADMIN"];

/**
 * Whether this person reads every line of a conversation: one of its two
 * sides, or staff. Anybody else in it is the agent of a deal there, who
 * reads only the lines about their own deal's listing (`agentListings`).
 */
export function readsWholeThread(
  viewer: { id: string; role: UserRole },
  thread: { buyerId: string; sellerId: string },
): boolean {
  return (
    viewer.id === thread.buyerId ||
    viewer.id === thread.sellerId ||
    STAFF_ROLES.includes(viewer.role)
  );
}

/**
 * The listings an agent may see in each of these conversations: those of
 * the running deals assigned to them there.
 *
 * A conversation is two people and may hold several deals, each with its
 * own agent. An agent is staff for the deals they are assigned to, not for
 * the platform — so the lines, files, previews, unread counts and
 * notifications they get are only those about their own deal's listing.
 * This is the one rule every one of those reads, so they cannot disagree.
 *
 * Only while the deal is still running: a dispute is still running — they
 * may need to answer it. Reassigned, moved to another role, banned, or the
 * deal over: no longer, and that includes anything said afterwards about a
 * later deal on the same listing, which may have another agent. Role and
 * ban are read from the database rather than the session, as `roleOnDeal`
 * does, so a desk taken away is gone at once.
 *
 * Left out, `conversationIds` means every conversation they have a deal in.
 * A conversation they have nothing in is absent from the map.
 */
export async function agentListings(
  agentId: string,
  conversationIds?: string[],
): Promise<Map<string, string[]>> {
  const listings = new Map<string, string[]>();
  if (conversationIds?.length === 0) return listings;
  if (!(await stillAnAgent(agentId))) return listings;
  const deals = await db.order.findMany({
    where: {
      agentId,
      status: { notIn: [...TERMINAL_STATUSES] },
      conversationId: conversationIds ? { in: conversationIds } : { not: null },
    },
    select: { conversationId: true, listingId: true },
  });
  for (const deal of deals) {
    if (!deal.conversationId) continue;
    const seen = listings.get(deal.conversationId) ?? [];
    if (!seen.includes(deal.listingId)) seen.push(deal.listingId);
    listings.set(deal.conversationId, seen);
  }
  return listings;
}

/** `agentListings` for one conversation: empty when they are not in it. */
export async function agentListingsOnThread(
  agentId: string,
  conversationId: string,
): Promise<string[]> {
  return (
    (await agentListings(agentId, [conversationId])).get(conversationId) ?? []
  );
}

/**
 * Whether this agent may read and write in this conversation at all: they
 * are the agent of a deal still running in it. One rule, for the thread,
 * posting, the poll, attachments and the inbox.
 */
export async function agentOnThread(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  return (await agentListingsOnThread(userId, conversationId)).length > 0;
}

/**
 * The lines this person may read in a conversation: null for all of them,
 * or the listings they are limited to. For someone already known to be in
 * it (`roleInThread`).
 */
export async function visibleListings(
  viewer: { id: string; role: UserRole },
  thread: { id: string; buyerId: string; sellerId: string },
): Promise<string[] | null> {
  if (readsWholeThread(viewer, thread)) return null;
  if (!isCustodianRole(viewer.role)) return [];
  return agentListingsOnThread(viewer.id, thread.id);
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
