import { Badge, type BadgeVariant } from "@/components/ui/badge";
import type { ListingStatus } from "@/generated/prisma/enums";

/**
 * What a status means to the seller looking at it, rather than what the
 * database calls it. "CODE_CHECK" tells them nothing; "Waiting on your code"
 * tells them whose turn it is.
 */
const STATUS: Record<
  ListingStatus,
  {
    label: string;
    variant: BadgeVariant;
    note: string;
  }
> = {
  DRAFT: {
    label: "Draft",
    variant: "neutral",
    note: "Only you can see this. Send it for review when it is ready.",
  },
  CODE_CHECK: {
    label: "Waiting on your code",
    variant: "primary",
    note: "Add the ownership code to your profile, then tell us it is there.",
  },
  ADMIN_REVIEW: {
    label: "In review",
    variant: "info",
    note: "We are checking the account. Nothing needed from you.",
  },
  LIVE: {
    label: "Live",
    variant: "verified",
    note: "Buyers can see this listing and make offers.",
  },
  RESERVED: {
    label: "Reserved",
    variant: "accent",
    // Reserved from the moment a deal opens until it ends, offer or not, so
    // "the buyer is paying" was wrong for most of it.
    note: "A deal is running for this listing. It stays off the market until the deal ends.",
  },
  SOLD: {
    label: "Sold",
    variant: "success",
    note: "This account has changed hands.",
  },
  REJECTED: {
    label: "Changes needed",
    variant: "danger",
    note: "Have a look at the note below, fix it and send it back.",
  },
  PAUSED: {
    label: "Paused",
    variant: "warning",
    note: "Hidden from buyers. Resume it whenever you like.",
  },
  REMOVED: {
    label: "Removed",
    variant: "danger",
    note: "This listing was taken down.",
  },
};

export function statusMeta(status: ListingStatus) {
  return STATUS[status];
}

export function ListingStatusBadge({
  status,
  size = "md",
}: {
  status: ListingStatus;
  size?: "sm" | "md";
}) {
  const meta = STATUS[status];
  return (
    <Badge variant={meta.variant} size={size}>
      {meta.label}
    </Badge>
  );
}
