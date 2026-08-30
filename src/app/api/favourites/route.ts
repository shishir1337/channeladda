import { getFavouriteIds, toggleFavourite } from "@/server/favourites";
import { getCurrentUser } from "@/server/session";

/**
 * Saved listings, read and written from the browser.
 *
 * A route handler rather than page data: the pages that show a heart — the
 * homepage, browse, each platform — are static, and threading "who is looking"
 * through them would make every one render per request just to fill in an
 * icon.
 */
export async function GET() {
  const user = await getCurrentUser();
  // Signed out is not an error here; it just means nothing is saved.
  if (!user) return Response.json({ ids: [] });
  return Response.json({ ids: await getFavouriteIds(user.id) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { error: "Sign in to save listings." },
      { status: 401 },
    );
  }

  let body: { listingId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  const listingId = typeof body.listingId === "string" ? body.listingId : "";
  if (!listingId) {
    return Response.json({ error: "Which listing?" }, { status: 400 });
  }

  const result = await toggleFavourite(user.id, listingId);
  if (!result.ok) {
    return Response.json({ error: "That listing is gone." }, { status: 404 });
  }
  return Response.json({ favourited: result.favourited });
}
