import { balanceOf } from "@/server/deals";
import { getCurrentUser } from "@/server/session";

/**
 * The signed-in member's wallet balance, for the site header.
 *
 * A route handler rather than page data, for the same reason as the saved
 * listings: the pages the header sits on are static, and threading "who is
 * looking" through them would make every one render per request just to
 * show one figure. Never cached — it is somebody's money.
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const user = await getCurrentUser();
  // Signed out is not an error here; there is simply no balance to show.
  if (!user) return Response.json({ balanceUsd: null }, { headers });
  return Response.json({ balanceUsd: await balanceOf(user.id) }, { headers });
}
