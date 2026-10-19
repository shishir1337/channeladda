/**
 * What somebody has completed on Channel Adda, as buyer and as seller.
 * Worked out by `@/server/track-record`; shared here so client components
 * can take it as a prop.
 */
export type TrackRecord = {
  deals: number;
  worthCents: number;
  safest: { deals: number; worthCents: number };
  fastest: { deals: number; worthCents: number };
  asBuyer: number;
  asSeller: number;
};

export function emptyRecord(): TrackRecord {
  return {
    deals: 0,
    worthCents: 0,
    safest: { deals: 0, worthCents: 0 },
    fastest: { deals: 0, worthCents: 0 },
    asBuyer: 0,
    asSeller: 0,
  };
}
