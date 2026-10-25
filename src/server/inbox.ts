import "server-only";

import { listThreads, type ThreadSummary } from "@/server/messages";
import type { CurrentUser } from "@/server/session";
import { type EscrowAgentEntry, escrowAgentEntry } from "@/server/support-chat";

/**
 * A member's Messages, in the order they are drawn.
 *
 * The Escrow Agent is always first: above running deals, before anybody has
 * written in it, and whatever else the list holds — the owner wanted it never
 * to sink under a pile of conversations. Then the conversations, as
 * `listThreads` orders them: running deals, then the rest, newest first.
 */
export type InboxEntry =
  | ({ kind: "escrow-agent" } & EscrowAgentEntry)
  | ({ kind: "thread" } & ThreadSummary);

export async function memberInbox(viewer: CurrentUser): Promise<InboxEntry[]> {
  const [agent, threads] = await Promise.all([
    escrowAgentEntry(viewer.id),
    listThreads(viewer),
  ]);
  return [
    { kind: "escrow-agent", ...agent },
    ...threads.map((thread) => ({ kind: "thread" as const, ...thread })),
  ];
}

/** The pinned row and the conversations under it, for drawing them apart. */
export function splitInbox(inbox: InboxEntry[]): {
  escrowAgent: EscrowAgentEntry;
  threads: ThreadSummary[];
} {
  let escrowAgent: EscrowAgentEntry | null = null;
  const threads: ThreadSummary[] = [];
  for (const entry of inbox) {
    if (entry.kind === "escrow-agent") {
      const { kind: _kind, ...rest } = entry;
      escrowAgent = rest;
    } else {
      const { kind: _kind, ...rest } = entry;
      threads.push(rest);
    }
  }
  if (!escrowAgent)
    throw new Error("The inbox always starts with the Escrow Agent.");
  return { escrowAgent, threads };
}
