import { ShieldCheckIcon, TriangleAlertIcon, ZapIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import type {
  DealMode,
  ListingStatus,
  OrderStatus,
  UserRole,
} from "@/generated/prisma/enums";
import { AGENT_HOLDS, isTerminal } from "@/lib/deal-machine";
import { cn } from "@/lib/utils";

/**
 * One vocabulary for the whole staff area.
 *
 * Thirteen order statuses, nine listing statuses, five roles, two deal modes.
 * Before this, each admin screen spelled them its own way — raw enum names in
 * the deal queues, seller-voiced labels ("Waiting on your code") in the
 * listing queue — so the same thing read differently depending on which page
 * you found it on. A console cannot afford that: staff learn one word per
 * state and then see it everywhere.
 *
 * Presentation only. Nothing here decides anything: the transition table in
 * `deal-machine` remains the single source of truth for what may happen, and
 * this module only says what it is called and what it means for whoever is
 * reading it.
 */

type Variant = ComponentProps<typeof Badge>["variant"];

// ------------------------------------------------------------------- deals

export const ORDER_STATUS: Record<
  OrderStatus,
  {
    label: string;
    variant: Variant;
    /** Whose move it is, in a word, or null once the deal has stopped. */
    whose: string | null;
    /** What is true of the world while a deal sits here. */
    note: string;
  }
> = {
  AWAITING_PAYMENT: {
    label: "Awaiting payment",
    variant: "neutral",
    whose: "buyer",
    note: "The buyer owes the opening payment. Nothing has moved yet.",
  },
  AGENT_VERIFYING: {
    label: "Agent verifying",
    variant: "info",
    whose: "agent",
    note: "Fastest. We hold the money while the agent checks the channel against the listing.",
  },
  AWAITING_CUSTODY: {
    label: "Awaiting custody",
    variant: "info",
    whose: "seller",
    note: "Safest. The seller has to invite the agent as channel owner.",
  },
  IN_CUSTODY: {
    label: "In custody",
    variant: "primary",
    whose: "buyer",
    note: "Safest. The agent genuinely owns the channel while the buyer inspects it.",
  },
  AWAITING_BUYER_PAYMENT: {
    label: "Awaiting buyer payment",
    variant: "info",
    whose: "buyer",
    note: "Safest. The buyer pays the seller directly, off-platform. That money never reaches us.",
  },
  AWAITING_HANDOVER: {
    label: "Awaiting handover",
    variant: "primary",
    whose: "transfer",
    note: "The final ownership transfer is under way.",
  },
  AWAITING_RELEASE: {
    label: "Awaiting release",
    variant: "primary",
    whose: "agent",
    note: "Fastest. The buyer has access and the seller has not been paid yet.",
  },
  DISPUTED: {
    label: "Disputed",
    variant: "danger",
    whose: "staff",
    note: "Paused, not finished. A moderator decides where it goes from here.",
  },
  COMPLETED: {
    label: "Completed",
    variant: "verified",
    whose: null,
    note: "The channel changed hands and everybody was paid.",
  },
  PAYMENT_EXPIRED: {
    label: "Payment expired",
    variant: "neutral",
    whose: null,
    note: "The payment window lapsed before anything moved.",
  },
  CANCELLED: {
    label: "Cancelled",
    variant: "neutral",
    whose: null,
    note: "Ended before a channel or a payment was in play.",
  },
  RETURNED_TO_SELLER: {
    label: "Returned to seller",
    variant: "neutral",
    whose: null,
    note: "Safest. The agent handed the channel back.",
  },
  REFUNDED: {
    label: "Refunded",
    variant: "info",
    whose: null,
    note: "Fastest. We returned the money we were holding to the buyer.",
  },
};

export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS[status]?.label ?? status;
}

export function OrderStatusBadge({
  status,
  size = "sm",
  className,
}: {
  status: OrderStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = ORDER_STATUS[status];
  return (
    <Badge
      variant={meta?.variant ?? "neutral"}
      size={size}
      className={className}
      title={meta?.note}
    >
      {meta?.label ?? status}
    </Badge>
  );
}

export const DEAL_MODE: Record<
  DealMode,
  { label: string; escrow: string; blurb: string }
> = {
  SAFEST: {
    label: "Safest",
    escrow: "channel escrowed",
    blurb:
      "The buyer pays us an admin fee only. An agent takes ownership of the channel, the buyer then pays the seller directly off-platform, and the agent transfers it on. Two Google waiting periods.",
  },
  FASTEST: {
    label: "Fastest",
    escrow: "money escrowed",
    blurb:
      "The buyer pays price plus fee to us. The seller transfers the channel with the agent supervising, and we credit the seller's wallet once the buyer confirms. One waiting period.",
  },
};

/**
 * The mode, as a tag.
 *
 * Deliberately not colour-coded: emerald means verified and gold means an
 * action everywhere else in the product, and a mode is a classification
 * rather than a state. The glyph carries the difference — a shield for the
 * channel we are holding, a bolt for the money we are holding.
 */
export function DealModeBadge({
  mode,
  size = "sm",
  className,
}: {
  mode: DealMode;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = DEAL_MODE[mode];
  const Icon = mode === "SAFEST" ? ShieldCheckIcon : ZapIcon;
  return (
    <Badge size={size} className={className} title={meta.blurb}>
      <Icon aria-hidden="true" />
      {meta.label}
      <span className="sr-only"> deal, {meta.escrow}</span>
    </Badge>
  );
}

/**
 * Statuses in which a Fastest buyer's money is sitting with the platform.
 *
 * Mirrors `PLATFORM_HOLDS` in `deal-machine`, which is not exported. Used for
 * wording only, never to decide whether something may happen, so drift here
 * mislabels a panel rather than mis-routing money.
 */
const MONEY_WITH_PLATFORM: readonly OrderStatus[] = [
  "AGENT_VERIFYING",
  "AWAITING_HANDOVER",
  "AWAITING_RELEASE",
];

/**
 * What is in whose hands right now, and what can still be undone.
 *
 * The asymmetry between the modes is the thing that gets got wrong under
 * pressure: on a Safest deal the purchase price goes buyer-to-seller
 * off-platform, so there is no price for us to refund however angry the buyer
 * is — only the admin fee, and only before the agent took custody.
 */
export function custodyFacts(mode: DealMode, status: OrderStatus) {
  const finished = isTerminal(status);
  const agentHolds = mode === "SAFEST" && AGENT_HOLDS.includes(status);
  const platformHolds =
    mode === "FASTEST" && MONEY_WITH_PLATFORM.includes(status);
  const beforeAnything = status === "AWAITING_PAYMENT";

  const asset = agentHolds
    ? "The agent owns the channel."
    : mode === "SAFEST"
      ? "The seller still owns the channel."
      : "The seller owns the channel until the handover.";

  const money = platformHolds
    ? "We are holding the price and the fee."
    : mode === "SAFEST"
      ? "We only ever hold the admin fee. The price goes buyer to seller off-platform."
      : "Nothing has cleared to us yet.";

  let recoverable: string;
  if (finished) {
    recoverable = "Finished. There is nothing left to recover.";
  } else if (beforeAnything) {
    recoverable = "Nothing has moved. Cancelling costs nobody anything.";
  } else if (agentHolds) {
    recoverable =
      "The channel can be returned to the seller. There is no price to refund — we never held it.";
  } else if (platformHolds) {
    recoverable =
      "We hold the full amount. A refund returns all of it to the buyer.";
  } else if (mode === "SAFEST") {
    recoverable =
      "The price never passed through us, so only the admin fee is ours to return.";
  } else {
    recoverable = "We are still holding the buyer's money: refund or release.";
  }

  return { finished, agentHolds, platformHolds, asset, money, recoverable };
}

// ---------------------------------------------------------------- listings

/**
 * Listing statuses in the staff voice.
 *
 * The seller-facing set says "Waiting on your code" and "Changes needed",
 * which is right on a seller's own dashboard and wrong in a queue a moderator
 * works: here "your" is not the reader.
 */
export const LISTING_STATUS: Record<
  ListingStatus,
  { label: string; variant: Variant; note: string }
> = {
  DRAFT: {
    label: "Draft",
    variant: "neutral",
    note: "Not submitted. Only the seller can see it.",
  },
  CODE_CHECK: {
    label: "Placing code",
    variant: "neutral",
    note: "With the seller, who has to put the ownership code on the profile.",
  },
  ADMIN_REVIEW: {
    label: "For review",
    variant: "primary",
    note: "Waiting on a moderator. This is the queue.",
  },
  LIVE: {
    label: "Live",
    variant: "verified",
    note: "Visible to buyers and taking offers.",
  },
  RESERVED: {
    label: "Reserved",
    variant: "info",
    note: "An offer was accepted and a deal is running.",
  },
  SOLD: {
    label: "Sold",
    variant: "neutral",
    note: "The channel has changed hands.",
  },
  REJECTED: {
    label: "Sent back",
    variant: "danger",
    note: "Returned to the seller with a reason to act on.",
  },
  PAUSED: {
    label: "Paused",
    variant: "neutral",
    note: "Hidden from buyers.",
  },
  REMOVED: {
    label: "Removed",
    variant: "danger",
    note: "Taken down by staff.",
  },
};

export function ListingStatusTag({
  status,
  size = "sm",
  className,
}: {
  status: ListingStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = LISTING_STATUS[status];
  return (
    <Badge
      variant={meta?.variant ?? "neutral"}
      size={size}
      className={className}
      title={meta?.note}
    >
      {meta?.label ?? status}
    </Badge>
  );
}

// ------------------------------------------------------------------- roles

/** Labels live in `server/admin-users`; only the styling is decided here. */
export const ROLE_VARIANT: Record<UserRole, Variant> = {
  USER: "neutral",
  AGENT: "info",
  MODERATOR: "info",
  FINANCE: "primary",
  SUPERADMIN: "danger",
};

// ------------------------------------------------------------- audit trail

/**
 * Audit actions, in one place.
 *
 * The overview and the deal desk each carried their own half of this map, so
 * an action logged by one feature read as a sentence on one page and as a raw
 * dotted key on the other — and between them they covered eleven of the
 * thirty-odd actions the server actually writes.
 *
 * Every label is a verb phrase that reads after a name, because both places
 * that use it put the actor in the next column: "Dev — approved a listing",
 * "Channel Adda — cleared an opening payment".
 */
export const AUDIT_LABEL: Record<string, string> = {
  "conversation.claim": "claimed a conversation",
  "deal.agent_assigned": "assigned an agent",
  "deal.cancelled": "cancelled a deal",
  "deal.completed": "completed a deal",
  "deal.created": "opened a deal",
  "deal.disputed": "raised a dispute",
  "deal.expired": "let a payment window lapse",
  "deal.fee_paid": "cleared an opening payment",
  "deal.refunded": "refunded a buyer",
  "deal.returned": "returned a channel to its seller",
  "deal.step_completed": "completed a step",
  "listing.approve": "approved a listing",
  "listing.ownership_verified": "confirmed an ownership code",
  "listing.reject": "sent a listing back",
  "listing.remove": "took a listing down",
  "payment.arrived_too_late": "took a payment that arrived too late",
  "payment.duplicate_credited": "credited a duplicate payment",
  "payment.reconciled": "reconciled a payment",
  "payment.recorded_by_hand": "recorded a payment by hand",
  "payment.reference_mismatch": "hit a payment reference mismatch",
  "payment.refunded_by_processor": "saw the processor refund a payment",
  "payment.underpaid": "took a payment that came in short",
  "payment.unsettled": "left a payment unsettled",
  "report.resolve": "handled a report",
  "settings.update": "changed the platform settings",
  "user.restore": "restored an account",
  "user.role": "changed someone's role",
  "user.suspend": "suspended an account",
  "wallet.deposit": "credited a wallet",
  "wallet.withdrawal_rejected": "refused a payout",
  "wallet.withdrawal_requested": "requested a payout",
  "wallet.withdrawal_sent": "sent a payout",
};

/** Falls back to a readable form of the key rather than printing the key. */
export function auditLabel(action: string): string {
  return AUDIT_LABEL[action] ?? action.replace(/[._]/g, " ");
}

// ------------------------------------------------------------------ ageing

/** Compact elapsed time: "just now", "14m", "7h", "3d". */
export function elapsed(since: Date, now: number = Date.now()) {
  const minutes = Math.max(0, Math.round((now - since.getTime()) / 60_000));
  const hours = minutes / 60;
  if (minutes < 1) return { label: "just now", hours };
  if (minutes < 60) return { label: `${minutes}m`, hours };
  if (hours < 48) return { label: `${Math.round(hours)}h`, hours };
  return { label: `${Math.round(hours / 24)}d`, hours };
}

export type AgeTone = "fresh" | "warn" | "late";

export function ageTone(
  hours: number,
  warnAfter: number,
  lateAfter: number,
): AgeTone {
  if (hours >= lateAfter) return "late";
  if (hours >= warnAfter) return "warn";
  return "fresh";
}

const AGE_CLASS: Record<AgeTone, string> = {
  fresh: "text-subtle",
  warn: "text-primary-text",
  late: "font-semibold text-danger",
};

/**
 * How long this has been sitting there.
 *
 * Colour alone would not carry it, so something late also changes weight and
 * gains a glyph, and the exact timestamp stays available on hover and to a
 * screen reader.
 */
export function Waited({
  since,
  warnAfter = 12,
  lateAfter = 24,
  prefix = "waiting",
  className,
}: {
  since: Date;
  /** Hours after which this is worth noticing. */
  warnAfter?: number;
  /** Hours after which it is a problem. */
  lateAfter?: number;
  prefix?: string;
  className?: string;
}) {
  const { label, hours } = elapsed(since);
  const tone = ageTone(hours, warnAfter, lateAfter);
  return (
    <time
      dateTime={since.toISOString()}
      title={since.toLocaleString("en-GB")}
      // Rendered on the server and again on the client in the few client
      // components that use it; a minute of drift, or a different timezone
      // in the title, must not warn.
      suppressHydrationWarning
      className={cn(
        "tnum inline-flex items-center gap-1 text-xs whitespace-nowrap",
        AGE_CLASS[tone],
        className,
      )}
    >
      {tone === "late" ? (
        <TriangleAlertIcon aria-hidden="true" className="size-3.5 shrink-0" />
      ) : null}
      {prefix ? `${prefix} ` : null}
      {label}
      {tone === "late" ? <span className="sr-only"> — overdue</span> : null}
    </time>
  );
}
