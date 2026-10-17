import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/server/session";
import { threadFingerprint } from "@/server/thread-fingerprint";

/**
 * Whether an open conversation has changed, for the page's poll.
 *
 * A route handler rather than a server action: actions from one page run one
 * at a time, so a poll every few seconds would queue in front of the person
 * pressing Accept. This is a cheap read with no side effects.
 *
 * 404 for anyone who may not read the thread — signed out, never part of it,
 * or no longer part of it — and the page stops polling when it sees one.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/conversations/[id]/fingerprint">,
) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  const fingerprint =
    user && !user.banned ? await threadFingerprint(id, user) : null;

  if (!fingerprint) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(
    { fingerprint },
    // Per person and per moment: nothing in between may keep a copy.
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
