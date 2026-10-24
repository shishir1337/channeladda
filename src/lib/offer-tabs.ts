import type { OfferStatus } from "@/generated/prisma/enums";
import { pickTab } from "@/lib/tabs";

/**
 * The Offers page's tabs: offers you need to answer, offers waiting on the
 * other side, and the ones that are over. Offers you made and offers on
 * your listings sit together — each card says which it is — because the
 * question is whose move it is, not who started.
 */
export type OfferTab = "yours" | "waiting" | "closed";

export const OFFER_TABS: readonly OfferTab[] = ["yours", "waiting", "closed"];

type Sortable = {
  effectiveStatus: OfferStatus;
  awaiting: "buyer" | "seller" | null;
  viewingAs: "buyer" | "seller";
  createdAt: Date;
};

export function offerTabs<T extends Sortable>(
  offers: T[],
): Record<OfferTab, T[]> {
  const tabs: Record<OfferTab, T[]> = { yours: [], waiting: [], closed: [] };
  const newest = [...offers].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  for (const offer of newest) {
    if (offer.effectiveStatus !== "OPEN") tabs.closed.push(offer);
    else if (offer.awaiting === offer.viewingAs) tabs.yours.push(offer);
    else tabs.waiting.push(offer);
  }
  return tabs;
}

export function openOfferTab(
  asked: string | undefined,
  counts: Record<OfferTab, number>,
): OfferTab {
  return pickTab(asked, OFFER_TABS, counts);
}
