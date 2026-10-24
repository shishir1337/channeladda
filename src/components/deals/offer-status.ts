import type { BadgeVariant } from "@/components/ui/badge";
import type { OfferStatus } from "@/generated/prisma/enums";

/**
 * How an offer stands, as a word and a colour — the same on the offer
 * card, in the chat and in Recent activity.
 *
 * Each outcome has its own colour because each means something different
 * to the reader: a decline is a no (red), a withdrawal is the buyer
 * stepping back (grey), an expiry is time running out (orange), a counter
 * is a new price on the table (violet).
 */
export const OFFER_STATUS: Record<
  OfferStatus,
  { label: string; variant: BadgeVariant }
> = {
  OPEN: { label: "Open", variant: "primary" },
  ACCEPTED: { label: "Accepted", variant: "verified" },
  REJECTED: { label: "Declined", variant: "danger" },
  COUNTERED: { label: "Countered", variant: "accent" },
  EXPIRED: { label: "Expired", variant: "warning" },
  WITHDRAWN: { label: "Withdrawn", variant: "neutral" },
};
