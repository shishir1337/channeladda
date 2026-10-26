import type { DealMode, OrderStatus } from "@/generated/prisma/enums";
import { type DealActor, isTerminal } from "@/lib/deal-machine";
import { awaitsAgent } from "@/lib/deal-templates";

/**
 * Whose move a deal is waiting on, worked out once for every view.
 *
 * The deal page, the deals list and its tabs, the dashboard's "Waiting on
 * you", the chat's deal panel, the agent's desk and the "your move"
 * notification each used to read it off the open step's actor. On a Safest
 * deal whose seller had not said where to be paid, that made the buyer's
 * page say "Pay the seller now" and "Your move", their dashboard "Waiting on
 * you", and the seller's "You are all caught up" — while there was nothing
 * the buyer could pay to, and the one thing that would move the deal was the
 * seller's (QA, CA-27058). So every one of them reads this.
 */

/** What a view knows about a deal, at the least. */
export type TurnInput = {
  mode: DealMode;
  status: OrderStatus;
  /** The lowest incomplete step, whatever the status. */
  next: { position: number; label: string; actor: DealActor } | null;
  holdUntil: Date | null;
  agentId: string | null;
  /** Safest: where the seller said to be paid, if they have. */
  sellerPayTo: string | null;
  now?: Date;
};

export type Turn =
  /** Ended, or with nothing left to do. */
  | { kind: "none" }
  /** A dispute: Channel Adda decides, and nobody else can act. */
  | { kind: "paused" }
  /** The open step waits for Channel Adda to assign an agent. */
  | { kind: "assigning" }
  /** The deal's hold is running: the next step opens on `until`. */
  | { kind: "held"; until: Date }
  /**
   * Somebody's move. `payTo`: the seller's, because the buyer cannot pay
   * them until they say where.
   */
  | { kind: "move"; actor: DealActor; payTo: boolean };

/**
 * Safest's step where the buyer pays the seller, with nothing on the
 * record to pay to. The buyer's Paid waits for it (`payToMissing` on the
 * server refuses it too).
 */
export function payToMissingOn(input: TurnInput): boolean {
  return (
    input.mode === "SAFEST" &&
    !isTerminal(input.status) &&
    input.status !== "DISPUTED" &&
    input.next?.label === "Pay the seller" &&
    !input.sellerPayTo?.trim()
  );
}

export function dealTurn(input: TurnInput): Turn {
  if (isTerminal(input.status) || !input.next) return { kind: "none" };
  if (input.status === "DISPUTED") return { kind: "paused" };
  if (awaitsAgent(input.mode, input.next.position, input.agentId)) {
    return { kind: "assigning" };
  }
  const now = input.now ?? new Date();
  if (input.holdUntil && input.holdUntil.getTime() > now.getTime()) {
    return { kind: "held", until: input.holdUntil };
  }
  if (payToMissingOn(input)) {
    return { kind: "move", actor: "seller", payTo: true };
  }
  return { kind: "move", actor: input.next.actor, payTo: false };
}

/**
 * Who the deal waits on, in one word: the actor whose move it is, "staff"
 * while Channel Adda assigns an agent or decides a dispute, and null when
 * nobody can move — a running hold, or a deal that has ended.
 */
export function awaitingOf(turn: Turn): DealActor | null {
  switch (turn.kind) {
    case "move":
      return turn.actor;
    case "assigning":
    case "paused":
      return "staff";
    default:
      return null;
  }
}

/** Whether it is this reader's move. */
export function isMoveOf(turn: Turn, reader: DealActor): boolean {
  return turn.kind === "move" && turn.actor === reader;
}
