import type { DealMode, OrderStatus, Platform } from "@/generated/prisma/enums";
import { isTerminal } from "@/lib/deal-machine";

/**
 * Google makes a new owner of a Brand Account wait seven days before they can
 * be made primary owner. Nothing comparable gates the other platforms'
 * transfers, so they show no owner timer.
 */
export const OWNER_WAIT_DAYS: Readonly<Record<Platform, number>> = {
  YOUTUBE: 7,
  INSTAGRAM: 0,
  FACEBOOK: 0,
  TELEGRAM: 0,
  WEBSITE: 0,
};

/**
 * Which clock a deal is waiting on right now, if any.
 *
 * Most of a deal is waiting: for the buyer to pay inside the window, for
 * Google to let a new owner become primary, for the recovery hold that
 * protects a Fastest buyer to run out. None of those were visible in the
 * conversation, so both sides asked "how long now?" — the chat shows the one
 * that is running instead. Pure, so each wait is pinned by a test.
 */
export type WaitInput = {
  mode: DealMode;
  status: OrderStatus;
  createdAt: Date;
  holdUntil: Date | null;
  steps: { position: number; completedAt: Date | null }[];
  paymentWindowHours: number;
  /** Google's wait before a new owner can be made primary; 0 where none applies. */
  ownerWaitDays: number;
  now: Date;
};

export type Wait = { label: string; until: Date };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Safest's two ownership transfers, each starting a Google wait: the agent
 * accepting custody (step 3) runs until hold 1 is confirmed (step 4), and the
 * agent transferring to the buyer (step 7) runs until hold 2 (step 8).
 */
const SAFEST_OWNER_WAITS = [
  { starts: 3, ends: 4 },
  { starts: 7, ends: 8 },
] as const;

export function activeWait(input: WaitInput): Wait | null {
  // A dispute freezes every step, so no clock it shows would mean anything.
  if (isTerminal(input.status) || input.status === "DISPUTED") return null;

  const running = (until: Date, label: string): Wait | null =>
    until.getTime() > input.now.getTime() ? { label, until } : null;

  if (input.status === "AWAITING_PAYMENT") {
    // Past the window it is the sweep's to close, not a countdown at zero.
    return running(
      new Date(input.createdAt.getTime() + input.paymentWindowHours * HOUR),
      "Payment window closes",
    );
  }

  if (input.holdUntil) {
    const hold = running(
      input.holdUntil,
      "Recovery hold ends, then the seller is paid",
    );
    if (hold) return hold;
  }

  if (input.mode === "SAFEST" && input.ownerWaitDays > 0) {
    const completed = (position: number) =>
      input.steps.find((step) => step.position === position)?.completedAt ??
      null;
    for (const wait of SAFEST_OWNER_WAITS) {
      const started = completed(wait.starts);
      if (started && !completed(wait.ends)) {
        return running(
          new Date(started.getTime() + input.ownerWaitDays * DAY),
          `Google's ${input.ownerWaitDays}-day owner wait ends`,
        );
      }
    }
  }

  return null;
}

/** "4d 6h", "5h 12m", "12m 05s", "45s": the coarsest grain still worth reading. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const secs = seconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${String(secs).padStart(2, "0")}s`;
  return `${secs}s`;
}
