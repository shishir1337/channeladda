import type { DealMode, OrderStatus } from "@/generated/prisma/enums";

/**
 * Which statuses a deal may move between, and who may move it.
 *
 * This is the whole of the rule, in one table, deliberately. A deal decides
 * who gets someone's money and who ends up owning someone's channel, so the
 * question "can this person move this deal from here to there?" must have
 * exactly one answer in exactly one place. Spread across the call sites it
 * would be eleven slightly different answers within a year.
 *
 * The table is pure: no Prisma, no session, no clock. Everything it needs is
 * in its arguments, so the rules can be tested exhaustively without a database
 * and the server layer is left with nothing to decide.
 */

/**
 * Who is asking.
 *
 * `system` is the platform acting on its own — a cleared payment, a lapsed
 * window. It is never a person, and no request may claim it.
 */
export type DealActor = "buyer" | "seller" | "agent" | "staff" | "system";

/** A deal that has stopped for good. A dispute has not: staff resolve it on. */
export const TERMINAL_STATUSES: readonly OrderStatus[] = Object.freeze([
  "COMPLETED",
  "PAYMENT_EXPIRED",
  "CANCELLED",
  "RETURNED_TO_SELLER",
  "REFUNDED",
]);

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Every state in which a Safest agent is holding the seller's channel.
 *
 * Exported because the per-agent cap counts the same thing, and two lists
 * of it disagreed: the cap counted `AWAITING_CUSTODY` and this one did not,
 * so a deal where the seller had already invited the agent as owner but
 * Google had not finished counted against the cap while having no way back
 * to the seller — only CANCELLED, which also refunds the fee.
 *
 * `AWAITING_CUSTODY` is in: the invitation has been sent, so the seller is
 * already exposed and must be able to get the channel back.
 */
export const AGENT_HOLDS: readonly OrderStatus[] = Object.freeze([
  "AWAITING_CUSTODY",
  "IN_CUSTODY",
  "AWAITING_BUYER_PAYMENT",
  "AWAITING_HANDOVER",
]);

/** Every state in which a Fastest buyer's money is sitting with the platform. */
const PLATFORM_HOLDS: readonly OrderStatus[] = Object.freeze([
  "AGENT_VERIFYING",
  "AWAITING_HANDOVER",
  "AWAITING_RELEASE",
]);

type Transition = {
  /** Null means the rule applies to both modes. */
  mode: DealMode | null;
  from: OrderStatus;
  to: OrderStatus;
  actors: readonly DealActor[];
};

const TRANSITIONS: readonly Transition[] = Object.freeze([
  // ---- Safest: the agent takes the channel, the buyer pays the seller
  // between the two Google waiting periods, the agent hands it on.
  {
    mode: "SAFEST",
    from: "AWAITING_PAYMENT",
    to: "AWAITING_CUSTODY",
    actors: ["system"],
  },
  {
    mode: "SAFEST",
    from: "AWAITING_CUSTODY",
    to: "IN_CUSTODY",
    actors: ["agent"],
  },
  {
    mode: "SAFEST",
    from: "IN_CUSTODY",
    to: "AWAITING_BUYER_PAYMENT",
    actors: ["buyer"],
  },
  {
    mode: "SAFEST",
    from: "AWAITING_BUYER_PAYMENT",
    to: "AWAITING_HANDOVER",
    actors: ["seller"],
  },
  {
    mode: "SAFEST",
    from: "AWAITING_HANDOVER",
    to: "COMPLETED",
    actors: ["agent"],
  },

  // ---- Fastest: the platform takes the money, the agent verifies, the seller
  // promotes the buyer directly, the platform pays out.
  {
    mode: "FASTEST",
    from: "AWAITING_PAYMENT",
    to: "AGENT_VERIFYING",
    actors: ["system"],
  },
  {
    mode: "FASTEST",
    from: "AGENT_VERIFYING",
    to: "AWAITING_HANDOVER",
    actors: ["agent"],
  },
  {
    mode: "FASTEST",
    from: "AWAITING_HANDOVER",
    to: "AWAITING_RELEASE",
    actors: ["buyer"],
  },
  {
    mode: "FASTEST",
    from: "AWAITING_RELEASE",
    to: "COMPLETED",
    actors: ["agent"],
  },

  // ---- Before anything has moved, either side may walk and the window may
  // lapse. Afterwards neither can: a channel or a payment is already in play.
  {
    mode: null,
    from: "AWAITING_PAYMENT",
    to: "PAYMENT_EXPIRED",
    actors: ["system"],
  },
  {
    mode: null,
    from: "AWAITING_PAYMENT",
    to: "CANCELLED",
    actors: ["buyer", "seller", "staff"],
  },
  {
    mode: "SAFEST",
    from: "AWAITING_CUSTODY",
    to: "CANCELLED",
    actors: ["staff"],
  },

  // ---- Giving the channel back. Reachable from every state in which the
  // agent holds it, not only the payment step: a buyer who disappears
  // mid-flow must not strand someone else's channel with the agent forever.
  ...AGENT_HOLDS.map((from) => ({
    mode: "SAFEST" as const,
    from,
    to: "RETURNED_TO_SELLER" as const,
    actors: ["staff"] as const,
  })),

  // ---- Giving the money back. Only Fastest: on a Safest deal the price went
  // straight from buyer to seller and the platform has nothing to return.
  ...PLATFORM_HOLDS.map((from) => ({
    mode: "FASTEST" as const,
    from,
    to: "REFUNDED" as const,
    actors: ["staff"] as const,
  })),
]);

/** Live states, in both modes — everywhere a dispute can still be raised. */
const DISPUTABLE: readonly OrderStatus[] = Object.freeze([
  "AWAITING_PAYMENT",
  "AGENT_VERIFYING",
  "AWAITING_CUSTODY",
  "IN_CUSTODY",
  "AWAITING_BUYER_PAYMENT",
  "AWAITING_HANDOVER",
  "AWAITING_RELEASE",
]);

/**
 * Where staff may take a dispute once they have decided it.
 *
 * `COMPLETED` matters as much as the refund routes: by the time most disputes
 * are raised one side has already performed, and an outcome set that only
 * ever favours one fixed party is not an adjudication.
 *
 * `CANCELLED` is here because a dispute can be raised before anyone has paid,
 * and without it such a deal had no reachable end at all: the refund routes
 * need a payment reference, the sweep only looked at orders still awaiting
 * payment, and the listing stayed reserved for ever. Opening a deal is free,
 * so that was a two-call denial of service against any listing on the site.
 */
const DISPUTE_OUTCOMES: Readonly<Record<DealMode, readonly OrderStatus[]>> =
  Object.freeze({
    SAFEST: ["COMPLETED", "RETURNED_TO_SELLER", "CANCELLED"],
    FASTEST: ["COMPLETED", "REFUNDED", "CANCELLED"],
  });

export function canTransition(
  mode: DealMode,
  from: OrderStatus,
  to: OrderStatus,
  actor: DealActor,
): boolean {
  // A deal that has stopped stays stopped. Checked before anything else so no
  // later rule can accidentally reopen one.
  if (isTerminal(from)) return false;

  // Either side may escalate while the deal is still live, and only staff may
  // then decide it. A dispute is a pause, not an outcome.
  if (to === "DISPUTED") {
    return (
      DISPUTABLE.includes(from) &&
      (actor === "buyer" || actor === "seller" || actor === "staff")
    );
  }
  if (from === "DISPUTED") {
    return actor === "staff" && DISPUTE_OUTCOMES[mode].includes(to);
  }

  return TRANSITIONS.some(
    (t) =>
      (t.mode === null || t.mode === mode) &&
      t.from === from &&
      t.to === to &&
      t.actors.includes(actor),
  );
}
