import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
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
    variant: ComponentProps<typeof Badge>["variant"];
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
    variant: "info",
    note: "An offer was accepted and the buyer is paying.",
  },
  SOLD: {
    label: "Sold",
    variant: "neutral",
    note: "This account has changed hands.",
  },
  REJECTED: {
    label: "Changes needed",
    variant: "danger",
    note: "Have a look at the note below, fix it and send it back.",
  },
  PAUSED: {
    label: "Paused",
    variant: "neutral",
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
