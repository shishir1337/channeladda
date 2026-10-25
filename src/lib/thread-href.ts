/**
 * The link to a conversation, opened on one listing.
 *
 * A conversation is one buyer and one seller, and may be about several of
 * the seller's listings. A link sent about one of them — a notification, an
 * email, a button on a deal — names it (`?about=`), so the thread opens with
 * that listing's deal panel and header rather than whichever listing was
 * talked about last. Without one the page picks (`pickFocus`).
 *
 * `base` is the member's inbox unless the link is for the staff desk.
 */
export function threadHref(
  conversationId: string,
  listingId?: string | null,
  base: "/dashboard/messages" | "/admin/messages" = "/dashboard/messages",
): string {
  const path = `${base}/${encodeURIComponent(conversationId)}`;
  return listingId ? `${path}?about=${encodeURIComponent(listingId)}` : path;
}
