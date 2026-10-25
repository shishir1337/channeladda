import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/server/session";
import {
  escrowAgentFingerprint,
  supportChatFingerprint,
} from "@/server/support-chat";

/**
 * Whether an open Escrow Agent chat has changed, for the page's poll — the
 * same job `/api/conversations/[id]/fingerprint` does for a deal chat.
 *
 * Without `thread`, the member's own chat, found by who is asking. With it,
 * one chat for the desk, and a 404 for anyone who does not answer them.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.banned) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const thread = request.nextUrl.searchParams.get("thread");
  const fingerprint = thread
    ? await supportChatFingerprint(thread, user)
    : await escrowAgentFingerprint(user.id);

  if (!fingerprint) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(
    { fingerprint },
    // Per person and per moment: nothing in between may keep a copy.
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
