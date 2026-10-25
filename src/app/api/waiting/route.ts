import { countDealsAwaiting } from "@/server/deals";
import { countUnreadThreads } from "@/server/messages";
import { getCurrentUser } from "@/server/session";

/**
 * The counts on the phone's tab bar, for the website: deals waiting on the
 * signed-in member, and chats with something unread. The same two figures
 * the dashboard's bar shows, from the same functions.
 *
 * A route handler for the reason the wallet balance is one: the pages the
 * bar sits on are static, and "who is looking" cannot come from them
 * without rendering every one per request. Never cached.
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const user = await getCurrentUser();
  // Signed out is not an error; nothing is waiting on nobody.
  if (!user) return Response.json({ deals: 0, messages: 0 }, { headers });
  const [deals, messages] = await Promise.all([
    countDealsAwaiting(user.id),
    countUnreadThreads(user.id),
  ]);
  return Response.json({ deals, messages }, { headers });
}
