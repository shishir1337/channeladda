import type { UserRole } from "@/generated/prisma/enums";

/**
 * The Escrow Agent: every member's own chat with Channel Adda's live agents,
 * pinned at the top of their Messages (the owner, 2026-10-26).
 *
 * The words and the rules both sides share, in `lib` so the inbox rail — a
 * Client Component — can draw the pinned row without importing the server.
 */

/** What members see the chat, and every reply in it, as. */
export const ESCROW_AGENT_NAME = "Escrow Agent";

/** The member's chat. A static segment, so it wins over `[id]`. */
export const ESCROW_AGENT_HREF = "/dashboard/messages/escrow-agent";

/** The pinned row's line before anybody has written. */
export const ESCROW_AGENT_LINE = "Ask a Channel Adda agent anything, any time.";

/** Never a reply time: agents are people, and a promise missed is worse. */
export const REPLY_PROMISE = "Our agents reply as soon as they can.";

/** The staff inbox. */
export const SUPPORT_CHATS_HREF = "/admin/support-chats";

/**
 * Who answers. The live agents — AGENT, and the moderators and superadmin
 * who run deals with them (`CUSTODIAN_ROLES`) — and FINANCE, which already
 * reads members' messages on the Conversations and Support desks and is the
 * desk a payout question needs.
 */
export const SUPPORT_CHAT_ROLES: readonly UserRole[] = [
  "AGENT",
  "MODERATOR",
  "FINANCE",
  "SUPERADMIN",
];

export function answersSupportChats(role: UserRole): boolean {
  return SUPPORT_CHAT_ROLES.includes(role);
}

/**
 * A flood guard. Deal chats have none; this one tells every agent when a
 * wait starts, so a script posting in a loop should stall here.
 */
export const SUPPORT_CHAT_LIMIT = { max: 20, windowMs: 60_000 } as const;
