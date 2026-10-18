"use client";

import { ArrowUpRightIcon, ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { Dot, Reference, TurnFlag } from "@/components/app/kit";
import { OfferActions } from "@/components/offers/offer-actions";
import { Price } from "@/components/ui/price";
import type {
  ListingStatus,
  OfferStatus,
  OrderStatus,
} from "@/generated/prisma/enums";
import { timeLeft } from "@/lib/chat-time";
import { cn } from "@/lib/utils";

/** An offer as the panel receives it: dates as ISO strings. */
export type PanelOfferView = {
  id: string;
  amountCents: number;
  bySeller: boolean;
  effectiveStatus: OfferStatus;
  expiresAt: string;
};

/** `PanelState` from `@/lib/deal-panel`, ready to cross into the browser. */
export type PanelStateView =
  | { kind: "staff"; dealId: string | null }
  | { kind: "pay"; dealId: string }
  | { kind: "waiting-for-payment"; dealId: string }
  | { kind: "step"; dealId: string; yourMove: boolean }
  | { kind: "start-deal"; priceCents: number; heldUntil: string }
  | { kind: "waiting-to-start"; heldUntil: string }
  | { kind: "offer-your-turn"; offer: PanelOfferView }
  | { kind: "offer-waiting-on-them"; offer: PanelOfferView }
  | { kind: "buy"; askingCents: number }
  | { kind: "propose"; askingCents: number }
  | { kind: "finished"; dealId: string; status: OrderStatus }
  | { kind: "unavailable"; listingStatus: ListingStatus };

const UNAVAILABLE: Partial<Record<ListingStatus, string>> = {
  RESERVED:
    "Reserved for another buyer. If that falls through it comes back on sale.",
  SOLD: "Sold.",
  PAUSED: "The seller has paused this listing for now.",
  REMOVED: "This listing was taken down.",
};

function dollars(cents: number) {
  return cents / 100;
}

/**
 * The one thing you can do next, at the top of the conversation.
 *
 * The chat's equivalent of the deal page's "Your move" card, and it keeps
 * that card's rule: one action on screen at a time. Which action is decided
 * by `dealPanelState` on the server; this only draws it.
 *
 * On a phone it folds to one line, so the conversation keeps the screen —
 * open when it is your move, closed when it is not. On a computer there is
 * room, and it stays open.
 */
export function DealPanel({
  state,
  viewerRole,
  otherName,
  listingSlug,
  dealReference,
  children,
}: {
  state: PanelStateView;
  viewerRole: "buyer" | "seller" | "agent" | "staff";
  /** The other side's first name, as the reader would say it. */
  otherName: string;
  listingSlug: string;
  dealReference: string | null;
  /**
   * The deal's own card for the states that need one — paying, a step —
   * drawn by the page from the deal it has already loaded.
   */
  children?: ReactNode;
}) {
  const view = describe(state, viewerRole, otherName);
  const [open, setOpen] = useState(view.yourMove);
  // Paying and a deal step already have a card of their own — the deal
  // page's — with its heading and its one button. The panel then is that
  // card, not a frame around it.
  const childOwns =
    Boolean(children) && (state.kind === "pay" || state.kind === "step");
  // While the buyer pays, a Safest seller's "where to pay you" card is a
  // card of its own too. It goes under the panel's card, not inside it, so
  // the column never draws a box in a box.
  const childBelow = Boolean(children) && state.kind === "waiting-for-payment";

  const toggle = (
    <button
      type="button"
      onClick={() => setOpen((was) => !was)}
      aria-expanded={open}
      className={cn(
        "flex min-h-11 w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-left transition-colors duration-150 focus-visible:-outline-offset-2 lg:hidden",
        childOwns
          ? cn(
              "rounded-card border bg-surface shadow-xs",
              view.yourMove ? "border-primary/45" : "border-line",
            )
          : "rounded-card",
      )}
    >
      {view.yourMove ? <Dot tone="primary" pulse /> : null}
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          view.yourMove ? "font-medium text-fg" : "text-muted",
        )}
      >
        {view.summary}
      </span>
      <ChevronDownIcon
        aria-hidden="true"
        className={cn(
          "size-4 shrink-0 text-subtle transition-transform duration-200",
          open && "rotate-180",
        )}
      />
    </button>
  );

  if (childOwns) {
    return (
      <section aria-label="What happens next">
        {toggle}
        <div className={cn("mt-2 lg:mt-0 lg:block", open ? "block" : "hidden")}>
          {children}
          <Body
            state={state}
            viewerRole={viewerRole}
            listingSlug={listingSlug}
            dealReference={dealReference}
            hasChildren
            framed={false}
          />
        </div>
      </section>
    );
  }

  return (
    <section aria-label="What happens next">
      <div
        className={cn(
          "rounded-card border bg-surface shadow-xs transition-colors duration-150",
          view.yourMove ? "border-primary/45" : "border-line",
        )}
      >
        {toggle}
        <div
          className={cn(
            "px-4 pb-4 lg:block lg:pt-4",
            open ? "block" : "hidden",
          )}
        >
          <div className="mb-2 hidden min-h-5 items-center lg:flex">
            {view.yourMove ? (
              <TurnFlag mine />
            ) : (
              <span className="text-xs font-medium text-subtle">
                What happens next
              </span>
            )}
          </div>
          <h2 className="text-[0.9375rem] leading-6 font-semibold text-fg">
            {view.title}
          </h2>
          {view.detail ? (
            <p className="mt-1 max-w-[62ch] text-[0.8125rem] leading-relaxed text-muted">
              {view.detail}
            </p>
          ) : null}

          <Body
            state={state}
            viewerRole={viewerRole}
            listingSlug={listingSlug}
            dealReference={dealReference}
            hasChildren={Boolean(children)}
            framed
          />
          {children && !childBelow ? (
            <div className="mt-4 border-t border-line">{children}</div>
          ) : null}
        </div>
      </div>

      {childBelow ? (
        // Takes no room when the card has nothing to say (a Fastest deal,
        // or no details yet for the agent to see).
        <div
          className={cn("mt-3 empty:mt-0 lg:block", open ? "block" : "hidden")}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

/** The words for each state: the folded line, the heading, one sentence. */
function describe(
  state: PanelStateView,
  viewerRole: "buyer" | "seller" | "agent" | "staff",
  otherName: string,
): {
  summary: string;
  title: ReactNode;
  detail?: ReactNode;
  yourMove: boolean;
} {
  switch (state.kind) {
    case "buy":
      return {
        summary: "Buy this channel, or make an offer",
        title: (
          <>
            Asking{" "}
            <Price
              usd={dollars(state.askingCents)}
              exact
              className="tabular-nums"
            />
          </>
        ),
        detail:
          "Buy at the asking price, or make an offer from the message box below.",
        yourMove: false,
      };
    case "propose":
      return {
        summary: `Offer ${otherName} a price`,
        title: `Offer ${otherName} a price`,
        detail: (
          <>
            Use “Offer a price” in the message box. It has to be below your
            asking price of <Price usd={dollars(state.askingCents)} exact />.
          </>
        ),
        yourMove: false,
      };
    case "offer-your-turn":
      return {
        summary: `${otherName} is waiting on your answer`,
        title: (
          <>
            {state.offer.bySeller
              ? `${otherName} offered to sell for `
              : `${otherName} offered `}
            <Price
              usd={dollars(state.offer.amountCents)}
              exact
              className="tabular-nums"
            />
          </>
        ),
        detail: `Accept it, counter, or turn it down · ${timeLeft(state.offer.expiresAt)}`,
        yourMove: true,
      };
    case "offer-waiting-on-them":
      return {
        summary: `Waiting on ${otherName}`,
        title: (
          <>
            {viewerRole === "seller" ? "Your price of " : "Your offer of "}
            <Price
              usd={dollars(state.offer.amountCents)}
              exact
              className="tabular-nums"
            />{" "}
            is with {otherName}
          </>
        ),
        detail: `${timeLeft(state.offer.expiresAt)}. You can withdraw it until they answer.`,
        yourMove: false,
      };
    case "start-deal":
      return {
        summary: "Start the deal at your agreed price",
        title: (
          <>
            <Price
              usd={dollars(state.priceCents)}
              exact
              className="tabular-nums"
            />{" "}
            is held for you
          </>
        ),
        detail: `Choose Safest or Fastest and start the deal · ${timeLeft(state.heldUntil)}`,
        yourMove: true,
      };
    case "waiting-to-start":
      return {
        summary: `Waiting for ${otherName} to start the deal`,
        title: `Waiting for ${otherName} to start the deal`,
        detail: `The listing is held for them · ${timeLeft(state.heldUntil)}. If they do not, it comes back on sale on its own.`,
        yourMove: false,
      };
    case "pay":
      return {
        summary: "Pay to begin the deal",
        title: "Pay to begin the deal",
        yourMove: true,
      };
    case "waiting-for-payment":
      return {
        summary: `Waiting for ${viewerRole === "seller" ? otherName : "the buyer"} to pay`,
        title: `Waiting for ${viewerRole === "seller" ? otherName : "the buyer"} to pay`,
        detail: "Nothing is needed from you until the payment clears.",
        yourMove: false,
      };
    case "step":
      return {
        summary: state.yourMove
          ? "Your move on the deal"
          : "The deal is under way",
        title: state.yourMove
          ? "Your move on the deal"
          : "The deal is under way",
        yourMove: state.yourMove,
      };
    case "finished":
      return {
        summary: "This deal has ended",
        title: "This deal has ended",
        yourMove: false,
      };
    case "unavailable":
      return {
        summary: "Not on sale right now",
        title: "Not on sale right now",
        detail:
          UNAVAILABLE[state.listingStatus] ??
          "This listing is not on sale right now.",
        yourMove: false,
      };
    case "staff":
      return {
        summary: "Staff view",
        title: state.dealId
          ? "There is a deal in this conversation"
          : "No deal yet",
        detail:
          "You are reading as Channel Adda. Decide deals from the deal page.",
        yourMove: false,
      };
  }
}

/** The controls for a state, where it has any of its own. */
function Body({
  state,
  viewerRole,
  listingSlug,
  dealReference,
  hasChildren = false,
  framed,
}: {
  state: PanelStateView;
  viewerRole: "buyer" | "seller" | "agent" | "staff";
  listingSlug: string;
  dealReference: string | null;
  /** The page supplied the card for this state, so no fallback link. */
  hasChildren?: boolean;
  /**
   * Inside the panel's own card, where the deal link is its footer; beside
   * the deal's cards, where it is a quiet line under them.
   */
  framed: boolean;
}) {
  const side = viewerRole === "buyer" || viewerRole === "seller";

  if (
    (state.kind === "offer-your-turn" ||
      state.kind === "offer-waiting-on-them") &&
    side
  ) {
    return (
      <div className="mt-3.5 empty:hidden">
        <OfferActions
          offer={{
            id: state.offer.id,
            amount: dollars(state.offer.amountCents),
            awaiting:
              state.offer.effectiveStatus === "OPEN"
                ? state.offer.bySeller
                  ? "buyer"
                  : "seller"
                : null,
            bySeller: state.offer.bySeller,
            effectiveStatus: state.offer.effectiveStatus,
          }}
          viewingAs={viewerRole}
        />
      </div>
    );
  }

  const dealId = "dealId" in state ? state.dealId : null;
  if (dealId) {
    return (
      <Link
        href={`/dashboard/deals/${dealId}`}
        className={cn(
          "group flex min-h-11 items-center gap-2 text-[0.8125rem] font-medium text-muted transition-colors duration-150 hover:text-fg pointer-fine:min-h-8",
          framed ? "-mb-1 mt-4 border-t border-line pt-3" : "mt-2 px-1",
        )}
      >
        {dealReference ? (
          <>
            Deal <Reference>{dealReference}</Reference>
          </>
        ) : (
          "The deal page"
        )}
        <ArrowUpRightIcon
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 text-subtle transition duration-150 group-hover:translate-x-px group-hover:-translate-y-px group-hover:text-fg",
            framed && "ml-auto",
          )}
        />
      </Link>
    );
  }

  if ((state.kind === "buy" || state.kind === "start-deal") && !hasChildren) {
    return (
      <Link
        href={`/listing/${listingSlug}`}
        className="group mt-3 inline-flex min-h-11 items-center gap-1.5 text-[0.8125rem] font-medium text-muted transition-colors duration-150 hover:text-fg pointer-fine:min-h-8"
      >
        Choose how to buy
        <ArrowUpRightIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-subtle transition duration-150 group-hover:translate-x-px group-hover:-translate-y-px group-hover:text-fg"
        />
      </Link>
    );
  }

  return null;
}
