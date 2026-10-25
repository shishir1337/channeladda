"use client";

import { TagIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { TurnFlag } from "@/components/app/kit";
import { OFFER_STATUS } from "@/components/deals/offer-status";
import { Badge } from "@/components/ui/badge";
import { iconText } from "@/components/ui/icon-hue";
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

const STATUS = OFFER_STATUS;

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
  senderHref = null,
  mine,
  createdAt,
  actions,
}: {
  offer: ThreadOfferView;
  viewerRole: "buyer" | "seller" | "agent" | "staff";
  senderName: string;
  /** Their public profile, as on a chat bubble: set only when they have one. */
  senderHref?: string | null;
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
    // Someone else's card lines up with their messages, past the avatar.
    <li className={mine ? "flex justify-end" : "flex justify-start pl-9"}>
      <article
        aria-label={`${heading}: ${status.label}`}
        className={cn(
          "w-full max-w-sm rounded-card border bg-surface shadow-xs transition-colors duration-150",
          yourMove ? "border-primary/45" : "border-line",
        )}
      >
        <div className="px-4 pt-3.5 pb-4">
          <header className="flex flex-wrap items-center gap-2">
            <TagIcon
              aria-hidden="true"
              className={`size-3.5 ${iconText(TagIcon)}`}
            />
            <span className="text-[0.8125rem] font-medium text-fg">
              {heading}
            </span>
            <Badge variant={status.variant} size="sm">
              {status.label}
            </Badge>
            {open ? (
              <span className="ml-auto text-xs text-subtle tabular-nums">
                {timeLeft(offer.expiresAt)}
              </span>
            ) : null}
          </header>

          <p className="mt-2.5 text-[1.375rem] leading-7 font-semibold tracking-[-0.015em] text-fg tabular-nums">
            <Price usd={offer.amountCents / 100} exact />
          </p>
          <p className="mt-0.5 text-xs text-subtle">
            {senderHref && !mine ? (
              <Link
                href={senderHref}
                className="rounded-sm underline-offset-4 transition-colors duration-150 hover:text-fg hover:underline"
              >
                {senderName}
              </Link>
            ) : (
              senderName
            )}
            <span aria-hidden="true" className="mx-1.5 text-line-strong">
              ·
            </span>
            <span className="tabular-nums">{chatTime(createdAt)}</span>
          </p>

          {offer.note ? (
            <p className="mt-3 border-l-2 border-line-strong pl-3 text-[0.8125rem] leading-relaxed wrap-break-word whitespace-pre-wrap text-muted">
              {offer.note}
            </p>
          ) : null}
        </div>

        {open ? (
          <footer className="flex flex-col gap-3 rounded-b-[inherit] border-t border-line bg-surface-2/50 px-4 py-3">
            {yourMove ? (
              <span>
                <TurnFlag mine />
              </span>
            ) : (
              <p className="text-xs text-subtle">
                {offer.awaiting === "seller"
                  ? "Waiting on the seller"
                  : "Waiting on the buyer"}
              </p>
            )}
            {actions ? <div className="empty:hidden">{actions}</div> : null}
          </footer>
        ) : actions ? (
          <div className="px-4 pb-4 empty:hidden">{actions}</div>
        ) : null}
      </article>
    </li>
  );
}
