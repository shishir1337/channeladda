import {
  ChevronRightIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
  ZapIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { InfoTip } from "@/components/app/info-tip";
import { Reference } from "@/components/app/kit";
import { ZonedTime } from "@/components/app/time-zone";
import { Badge } from "@/components/ui/badge";
import type {
  DealMode,
  ListingStatus,
  OrderStatus,
  UserRole,
} from "@/generated/prisma/enums";
import { AGENT_HOLDS, isTerminal, PLATFORM_HOLDS } from "@/lib/deal-machine";
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
    label: "Handing over to us",
    variant: "info",
    whose: "seller",
    note: "Fastest. We hold the money while the seller invites the agent as owner and the agent invites the buyer.",
  },
  AWAITING_CUSTODY: {
    label: "Awaiting custody",
    variant: "info",
    whose: "seller",
    note: "Safest. The seller invites the agent as owner, Google's wait runs, the seller makes the agent primary owner, and the agent verifies the channel.",
  },
  IN_CUSTODY: {
    label: "In custody",
    variant: "accent",
    whose: "buyer",
    note: "The agent owns the channel. Safest: the buyer pays the seller directly and the seller confirms it arrived. Fastest: the seller has been paid, and the agent makes the buyer primary owner.",
  },
  AWAITING_BUYER_PAYMENT: {
    label: "Awaiting buyer payment",
    variant: "info",
    whose: "buyer",
    note: "Safest, from the earlier steps, when the price came to us. No new deal reaches this.",
  },
  AWAITING_HANDOVER: {
    label: "Awaiting handover",
    variant: "accent",
    whose: "transfer",
    note: "Safest: the agent is transferring the channel to the buyer. Fastest: the holding period, then the seller makes the agent primary owner.",
  },
  AWAITING_RELEASE: {
    label: "Awaiting release",
    variant: "primary",
    whose: "agent",
    note: "Fastest, from the earlier steps: the buyer is primary owner and the seller has not been paid yet. No new deal reaches this.",
  },
  DISPUTED: {
    label: "Disputed",
    variant: "danger",
    whose: "staff",
    note: "Paused, not finished. A moderator decides where it goes from here.",
  },
  COMPLETED: {
    label: "Completed",
    variant: "success",
    whose: null,
    note: "The channel changed hands and the seller was paid.",
  },
  PAYMENT_EXPIRED: {
    label: "Payment expired",
    variant: "warning",
    whose: null,
    note: "The payment window lapsed before anything moved.",
  },
  CANCELLED: {
    label: "Cancelled",
    variant: "danger",
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
      "The buyer pays us the admin fee, an agent becomes the channel's primary owner after Google's wait and verifies it, the buyer pays the seller directly, and once the seller confirms it arrived the agent invites the buyer as owner and, after Google's wait again, makes them primary owner. We never hold the price.",
  },
  FASTEST: {
    label: "Fastest",
    escrow: "money escrowed",
    blurb:
      "The buyer pays price plus fee to us. The seller invites the agent as owner, the agent invites the buyer and the holding period runs, the seller makes the agent primary owner — which credits the seller's wallet — and the agent makes the buyer primary owner.",
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
 * The identifying line of a deal, the same on every staff desk.
 *
 * The listing first, because that is what a person recognises; then the
 * reference a customer quotes, and the tags that qualify it — mode, status,
 * how long it has waited; the amount on the right, where figures line up down
 * a queue. Presentation only, like everything else here.
 */
export function DealHead({
  title,
  reference,
  tags,
  amount,
  chevron,
}: {
  title: ReactNode;
  reference: string;
  tags?: ReactNode;
  amount?: ReactNode;
  /** Inside a linked row, so the row reads as a door. */
  chevron?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-5 font-medium text-fg">
          {title}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Reference>{reference}</Reference>
          {tags}
        </div>
      </div>
      {amount ? <div className="shrink-0">{amount}</div> : null}
      {chevron ? (
        <ChevronRightIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-subtle transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-muted"
        />
      ) : null}
    </div>
  );
}

/**
 * What is in whose hands right now, and what can still be undone.
 *
 * What gets got wrong under pressure is what each mode can still give back.
 * On a Safest deal we only ever hold the admin fee — the price goes to the
 * seller directly — and the fee is kept once the agent has taken custody, so
 * what returning a channel refunds depends on how far it got.
 *
 * `facts` matters most for DISPUTED, which is the only status staff decide
 * a deal from — and the one the status alone cannot describe, because a
 * dispute can be raised at any point. Worked out from status only, a
 * disputed Fastest deal read “nothing has cleared to us yet” while we held
 * the full price, and a disputed Safest deal read “the seller still owns the
 * channel” while a staff agent did. Without the facts, a disputed deal now
 * says so rather than guessing.
 */
export function custodyFacts(
  mode: DealMode,
  status: OrderStatus,
  facts?: { paid?: boolean; inCustody?: boolean },
) {
  const finished = isTerminal(status);
  const disputed = status === "DISPUTED";
  const fastest = mode === "FASTEST";
  // Safest: from the seller's invite. Fastest: once our agent is primary
  // owner (custody), which is also when the seller was paid.
  const agentHolds = fastest
    ? status === "IN_CUSTODY" || (disputed && facts?.inCustody === true)
    : AGENT_HOLDS.includes(status) || (disputed && facts?.inCustody === true);
  const sellerPaid = fastest && agentHolds;
  // Every paid, running deal has money with us — price and fee on Fastest
  // until custody pays the seller, the admin fee on Safest, where every
  // state the agent holds the channel in comes after the opening payment.
  const platformHolds =
    !sellerPaid &&
    ((fastest ? PLATFORM_HOLDS : AGENT_HOLDS).includes(status) ||
      (disputed && facts?.paid === true));
  const unknown = disputed && facts === undefined;
  const beforeAnything = status === "AWAITING_PAYMENT";

  const asset = unknown
    ? "Paused. Check the step list for who holds the channel."
    : agentHolds
      ? "The agent owns the channel."
      : mode === "SAFEST"
        ? "The seller still owns the channel."
        : "The seller is still primary owner; our agent takes the channel from them first.";

  const money = unknown
    ? "Paused. Check whether the opening payment cleared."
    : sellerPaid
      ? "The seller has been paid. We hold none of this deal's money."
      : platformHolds
        ? mode === "SAFEST"
          ? "We are holding the admin fee. The price goes to the seller directly."
          : "We are holding the price and the fee."
        : "Nothing has cleared to us yet.";

  let recoverable: string;
  if (finished) {
    recoverable = "Finished. There is nothing left to recover.";
  } else if (unknown) {
    recoverable =
      "Disputed. Read the record before deciding: what can be returned depends on how far the deal got.";
  } else if (beforeAnything) {
    recoverable = "Nothing has moved. Cancelling costs nobody anything.";
  } else if (sellerPaid) {
    recoverable =
      "The seller has been paid, so there is no refund. The only outcome left is finishing it: our agent makes the buyer primary owner.";
  } else if (agentHolds) {
    recoverable =
      "The channel has to go back to the seller, or on to the buyer — only on, once the seller has pressed Received. Returning it refunds the admin fee unless our agent has taken custody; finance decides.";
  } else if (platformHolds) {
    recoverable =
      "We hold the full amount. Refunding or cancelling returns all of it to the buyer; finance decides which.";
  } else {
    recoverable =
      "Nothing has cleared to us, so there is nothing of the buyer’s to return.";
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
    variant: "info",
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
    variant: "accent",
    note: "An offer was accepted and a deal is running.",
  },
  SOLD: {
    label: "Sold",
    variant: "success",
    note: "The channel has changed hands.",
  },
  REJECTED: {
    label: "Sent back",
    variant: "danger",
    note: "Returned to the seller with a reason to act on.",
  },
  PAUSED: {
    label: "Paused",
    variant: "warning",
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
  "deal.dispute_note": "added to a dispute’s record",
  "deal.expired": "let a payment window lapse",
  "deal.fee_paid": "cleared an opening payment",
  "deal.handover_changed": "corrected the account to transfer to",
  "deal.hold_ended": "ended a waiting period early",
  "deal.pay_to_saved": "said where to be paid",
  "deal.refunded": "refunded a buyer",
  "deal.returned": "returned a channel to its seller",
  "deal.step_completed": "completed a step",
  "listing.approve": "approved a listing",
  "listing.edit": "edited their live listing",
  "listing.ownership_verified": "confirmed an ownership code",
  "listing.reject": "sent a listing back",
  "listing.remove": "took a listing down",
  "listing.reopen": "sent a taken-down listing back to review",
  "listing.seller_remove": "removed their own listing",
  "listing.feature": "featured a listing",
  "listing.unfeature": "stopped featuring a listing",
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
  "staff.invite_accepted": "accepted an invitation to the team",
  "wallet.adjustment": "corrected a balance",
  "money.ledger_exported": "downloaded the ledger",
  "money.payouts_exported": "downloaded the payouts",
  "user.kyc": "recorded an identity check",
  "kyc.submit": "sent their ID for the Verified badge",
  "kyc.approve": "approved an ID check",
  "kyc.reject": "turned down an ID check",
  "user.two_factor_reset": "reset someone’s two-step verification",
  "user.email_verified": "verified an email address by hand",
  "user.email_changed": "changed their email",
  "user.password_changed": "changed their password",
  "user.sessions_ended": "signed someone out everywhere",
  "staff.invite_revoked": "withdrew an invitation",
  "staff.invited": "invited somebody onto the team",
  "user.agent_identity": "set an agent's transfer identity",
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

/** A seller's live edit, field by field, in the columns it wrote. */
const LISTING_FIELD: Record<
  string,
  { label: string; show: (value: unknown) => string }
> = (() => {
  const text = (value: unknown) =>
    typeof value === "string" && value.trim() !== "" ? value : "nothing";
  const usd = (value: unknown) =>
    typeof value === "number"
      ? (value / 100).toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        })
      : "nothing";
  const count = (value: unknown) =>
    typeof value === "number" ? value.toLocaleString("en-US") : "nothing";
  // Pictures and long text are said to have changed, not printed.
  const changed = () => "";
  return {
    title: { label: "Title", show: text },
    niche: { label: "Niche", show: text },
    country: { label: "Audience country", show: text },
    audience: { label: "Audience", show: count },
    monetized: {
      label: "Monetized",
      show: (value) => (value ? "yes" : "no"),
    },
    monthlyRevenueUsd: { label: "Monthly revenue", show: usd },
    yearlyRevenueUsd: { label: "Last 12 months", show: usd },
    engagementBp: {
      label: "Engagement",
      show: (value) =>
        typeof value === "number" ? `${value / 10}%` : "nothing",
    },
    ageYears: { label: "Account age", show: count },
    priceUsd: { label: "Asking price", show: usd },
    coverUrl: { label: "Cover image", show: changed },
    avatarUrl: { label: "Profile picture", show: changed },
    description: { label: "About this account", show: changed },
    transferProfile: { label: "Account setup", show: text },
    whatsapp: { label: "WhatsApp", show: text },
  };
})();

/**
 * What a `listing.edit` row changed, one line per field: "Asking price:
 * $100.00 → $90.00", or just "Cover image" for a picture or the long text.
 */
export function listingEditLines(before: unknown, after: unknown): string[] {
  const from = (before ?? {}) as Record<string, unknown>;
  const to = (after ?? {}) as Record<string, unknown>;
  return Object.keys(to).map((key) => {
    const field = LISTING_FIELD[key];
    if (!field) return key;
    const was = field.show(from[key]);
    const now = field.show(to[key]);
    return was === "" && now === ""
      ? field.label
      : `${field.label}: ${was} → ${now}`;
  });
}

// ------------------------------------------------------------ empty states

/**
 * A heading with its explanation behind an (i).
 *
 * For an empty state or a cleared queue on a staff desk: the empty screen is
 * a title and an icon, and the sentence about where work comes from is one
 * tap away instead of a paragraph under it. The kit's `EmptyState` and
 * `AllClear` take a node for a title, so this drops straight in.
 */
export function TitleWithInfo({
  title,
  label,
  children,
}: {
  title: string;
  /** What the (i) is called to a screen reader. */
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {title}
      <InfoTip label={label}>{children}</InfoTip>
    </span>
  );
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
  fresh: "bg-surface-2 text-muted ring-line",
  warn: "bg-primary-soft text-primary-text ring-primary/25",
  late: "bg-danger-soft font-semibold text-danger ring-danger/20",
};

/**
 * How long this has been sitting there.
 *
 * A small tabular chip — square-cornered, so it never reads as a status pill —
 * that stays neutral while the wait is ordinary, warms to gold once it is worth
 * noticing and turns red when it is a problem. Colour alone would not carry it,
 * so something late also changes weight and gains a glyph, and the exact
 * timestamp stays available on hover and to a screen reader.
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
    <ZonedTime
      at={since}
      // Rendered on the server and again on the client in the few client
      // components that use it; a minute of drift must not warn. The title
      // is in the reader's zone on both.
      suppressHydrationWarning
      className={cn(
        "tnum inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs leading-none font-medium whitespace-nowrap ring-1 ring-inset",
        AGE_CLASS[tone],
        className,
      )}
    >
      {tone === "late" ? (
        <TriangleAlertIcon aria-hidden="true" className="size-3 shrink-0" />
      ) : null}
      {prefix ? `${prefix} ` : null}
      {label}
      {tone === "late" ? <span className="sr-only"> — overdue</span> : null}
    </ZonedTime>
  );
}
