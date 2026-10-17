"use client";

import { TagIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
import type { OfferStatus } from "@/generated/prisma/enums";
import { chatTime, timeLeft } from "@/lib/chat-time";
import { cn } from "@/lib/utils";

/** An offer card as the browser receives it: the server's, with ISO dates. */
export type ThreadOfferView = {
  id: string;
  amountCents: number;
  bySeller: boolean;
  note: string | null;
  effectiveStatus: OfferStatus;
  awaiting: "buyer" | "seller" | null;
  expiresAt: string;
};

const STATUS: Record<
  OfferStatus,
  { label: string; variant: "neutral" | "verified" | "primary" | "info" }
> = {
  OPEN: { label: "Open", variant: "primary" },
  ACCEPTED: { label: "Accepted", variant: "verified" },
  REJECTED: { label: "Declined", variant: "neutral" },
  COUNTERED: { label: "Countered", variant: "info" },
  EXPIRED: { label: "Expired", variant: "neutral" },
  WITHDRAWN: { label: "Withdrawn", variant: "neutral" },
};

/**
 * One offer, in the conversation it belongs to.
 *
 * It shows the offer as it stands now, not as it was announced: the same
 * card says "Open · 31h left" today and "Countered" tomorrow, so nobody
 * answers an offer that has already been answered. The buttons that answer it
 * come from outside (`actions`), only for the person whose move it is — the
 * card itself never decides who may do what; the server does, again, on press.
 */
export function ChatOfferCard({
  offer,
  viewerRole,
  senderName,
  mine,
  createdAt,
  actions,
}: {
  offer: ThreadOfferView;
  viewerRole: "buyer" | "seller" | "agent" | "staff";
  senderName: string;
  mine: boolean;
  createdAt: string;
  /** Accept, counter, decline or withdraw — supplied when they apply. */
  actions?: ReactNode;
}) {
  const status = STATUS[offer.effectiveStatus];
  const open = offer.effectiveStatus === "OPEN";
  const yourMove = open && offer.awaiting === viewerRole;
  const heading = offer.bySeller ? "Price from the seller" : "Offer";

  return (
    <li className={mine ? "flex justify-end" : "flex justify-start"}>
      <article
        aria-label={`${heading}: ${status.label}`}
        className={cn(
          "w-full max-w-sm rounded-panel border p-4",
          yourMove
            ? "border-primary/40 bg-primary-soft"
            : "border-line bg-surface",
        )}
      >
        <header className="flex flex-wrap items-center gap-2">
          <TagIcon aria-hidden="true" className="size-3.5 text-muted" />
          <span className="text-xs font-semibold text-fg">{heading}</span>
          <Badge variant={status.variant} size="sm">
            {status.label}
          </Badge>
          {open ? (
            <span className="ml-auto text-xs text-subtle tabular-nums">
              {timeLeft(offer.expiresAt)}
            </span>
          ) : null}
        </header>

        <p className="mt-2.5 font-display text-2xl font-black text-fg">
          <Price usd={offer.amountCents / 100} exact />
        </p>
        <p className="mt-0.5 text-xs text-subtle">
          {senderName} · {chatTime(createdAt)}
        </p>

        {offer.note ? (
          <p className="mt-3 rounded-card border border-line bg-surface-2 p-3 text-sm leading-relaxed whitespace-pre-wrap text-muted">
            {offer.note}
          </p>
        ) : null}

        {open ? (
          <p
            className={cn(
              "mt-3 text-xs",
              yourMove ? "font-medium text-primary-text" : "text-subtle",
            )}
          >
            {yourMove
              ? "Your move"
              : offer.awaiting === "seller"
                ? "Waiting on the seller"
                : "Waiting on the buyer"}
          </p>
        ) : null}

        {actions ? <div className="mt-3">{actions}</div> : null}
      </article>
    </li>
  );
}
