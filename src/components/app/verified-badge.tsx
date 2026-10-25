import { BadgeCheckIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

/**
 * The Verified badge, in words: our team checked this person's ID.
 *
 * Shown only for an approved ID check (`User.kycStatus === "APPROVED"`).
 * Not the same thing as a listing's ownership check, which proves a channel
 * belongs to its seller and keeps its own mark.
 */
export function VerifiedBadge({
  size = "sm",
  children = "Verified",
}: {
  size?: "sm" | "md";
  children?: ReactNode;
}) {
  return (
    <Badge variant="verified" size={size}>
      <BadgeCheckIcon aria-hidden="true" />
      {children}
    </Badge>
  );
}
