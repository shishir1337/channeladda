"use client";

import { BadgeCheckIcon } from "lucide-react";
import { InfoTip } from "@/components/app/info-tip";
import { Badge } from "@/components/ui/badge";
import { type VerifiedWith, verifiedNote } from "@/lib/kyc";
import { cn } from "@/lib/utils";

/**
 * The Verified mark beside a seller's name, and what it means on hover or
 * a tap (the owner, 2026-10-26): which ID they gave us with a video selfie,
 * that it can go to the police in a fraud, and their citizenship.
 *
 * `relative z-10` because in the sellers lists the whole row is a link
 * stretched over everything; the mark has to sit above it to be tapped.
 */
export function VerifiedMark({
  detail,
  pill = false,
  className,
}: {
  detail: VerifiedWith | null | undefined;
  /** The "ID verified" pill rather than the bare mark. */
  pill?: boolean;
  className?: string;
}) {
  return (
    <InfoTip
      label="Verified seller: ID checked by Channel Adda. What this means"
      className={cn(
        "z-10 size-auto rounded-full text-verified hover:text-verified focus-visible:text-verified data-[state=delayed-open]:text-verified data-[state=instant-open]:text-verified",
        pill && "pointer-coarse:after:inset-0",
      )}
      icon={
        pill ? (
          <Badge variant="verified" size="md">
            <BadgeCheckIcon aria-hidden="true" />
            ID verified
          </Badge>
        ) : (
          <BadgeCheckIcon
            aria-hidden="true"
            className={cn("size-4 shrink-0", className)}
          />
        )
      }
    >
      <span className="block font-semibold text-fg">ID verified</span>
      <span className="mt-1 block">{verifiedNote(detail ?? null)}</span>
    </InfoTip>
  );
}
