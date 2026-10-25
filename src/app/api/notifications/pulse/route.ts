import { emptyPulse, type Pulse } from "@/lib/notification-sound";
import { latestUnread, unreadCount } from "@/server/notifications";
import { getCurrentUser } from "@/server/session";

/**
 * Has anything arrived? Asked by every open tab of a signed-in member, on
 * the website and in the dashboard, so the chime can sound in a tab nobody
 * is looking at (`@/components/app/notification-sound`).
 *
 * Two indexed reads: the unread count the bell shows, and the newest few
 * unread rows with only what tells new from old. Never cached.
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const user = await getCurrentUser();
  // Signed out is not an error; nothing has arrived for nobody.
  if (!user) {
    return Response.json(emptyPulse(new Date().toISOString()), { headers });
  }

  const [unread, rows] = await Promise.all([
    unreadCount(user.id),
    latestUnread(user.id),
  ]);
  const recent = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    href: row.href,
    at: row.createdAt.toISOString(),
  }));

  const pulse: Pulse = {
    unread,
    latestId: recent[0]?.id ?? null,
    latestAt: recent[0]?.at ?? null,
    recent,
    now: new Date().toISOString(),
  };
  return Response.json(pulse, { headers });
}
