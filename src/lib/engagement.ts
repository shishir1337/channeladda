/**
 * A listing's engagement rate as it is shown, or null when there is none.
 *
 * A website may be listed without one (it has visits, not a feed), and is
 * stored as 0 — which on a card read "0% engagement", as if nobody cared.
 */
export function engagementShown(listing: {
  platform: string;
  engagement: number;
}): string | null {
  if (listing.platform === "website" && listing.engagement === 0) return null;
  return `${listing.engagement}%`;
}
