import { platformMap } from "@/data/platforms";
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
 * How long a deal's one hold lasts, in days. 0 means there is none.
 *
 * Safest waits on Google's own clock before our agent can be made primary
 * owner; Fastest runs the platform's holding period while the buyer is a
 * manager, before they are made primary owner and the seller is paid.
 */
export function holdDaysFor(mode: DealMode, platform: Platform): number {
  if (mode === "SAFEST") return OWNER_WAIT_DAYS[platform];
  return (
    platformMap[platform.toLowerCase() as keyof typeof platformMap]?.holdDays ??
    14
  );
}

/**
 * Which clock a deal is waiting on right now, if any.
 *
 * Most of a deal is waiting: for the buyer to pay inside the window, for
 * Google to let our agent become primary owner, for the holding period
 * before a Fastest buyer does. None of those were visible in the
 * conversation, so both sides asked "how long now?" — the chat shows the one
 * that is running instead. Pure, so each wait is pinned by a test.
 */
export type WaitInput = {
  mode: DealMode;
  status: OrderStatus;
  createdAt: Date;
  holdUntil: Date | null;
  paymentWindowHours: number;
  now: Date;
};

export type Wait = { label: string; until: Date };

const HOUR = 3_600_000;

/** Short: it sits in a narrow column, and the step card says what follows. */
const HOLD_LABELS: Readonly<Record<DealMode, string>> = {
  SAFEST: "Google's wait ends",
  FASTEST: "Holding period ends",
};

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

  return input.holdUntil
    ? running(input.holdUntil, HOLD_LABELS[input.mode])
    : null;
}

/** "4d 6h", "5h 12m", "12m 05s", "45s": the coarsest grain still worth reading. */
/**
 * The cards of a flip clock: every unit as two digits, days only while
 * there are any left. A wait already over reads 00 00 00.
 */
export function countdownParts(
  ms: number,
): { unit: "days" | "hrs" | "min" | "sec"; value: string }[] {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(seconds / 86_400);
  const two = (n: number) => String(n).padStart(2, "0");
  return [
    ...(days > 0 ? [{ unit: "days" as const, value: two(days) }] : []),
    { unit: "hrs", value: two(Math.floor((seconds % 86_400) / 3_600)) },
    { unit: "min", value: two(Math.floor((seconds % 3_600) / 60)) },
    { unit: "sec", value: two(seconds % 60) },
  ];
}

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
