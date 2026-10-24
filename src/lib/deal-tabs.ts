import type { OrderStatus } from "@/generated/prisma/enums";
import { pickTab } from "@/lib/tabs";

/**
 * The Deals page's tabs, one per state: yours to do, in progress, paused
 * with us, finished. The owner found sections stacked down the page harder
 * to use than tabs, where a deal sits in exactly one place.
 */
export type DealTab = "yours" | "running" | "paused" | "finished";

export const DEAL_TABS: readonly DealTab[] = [
  "yours",
  "running",
  "paused",
  "finished",
];

type Sortable = {
  status: OrderStatus;
  side: string;
  awaiting: string | null;
  waitingUntil: Date | null;
};

export function dealTabs<T extends Sortable>(deals: T[]): Record<DealTab, T[]> {
  const tabs: Record<DealTab, T[]> = {
    yours: [],
    running: [],
    paused: [],
    finished: [],
  };
  for (const deal of deals) {
    // A disputed deal still names a next actor, but nobody can act on it.
    if (deal.status === "DISPUTED") tabs.paused.push(deal);
    else if (deal.awaiting === null) tabs.finished.push(deal);
    // A step behind a running hold is nobody's move until it ends.
    else if (deal.awaiting === deal.side && deal.waitingUntil === null) {
      tabs.yours.push(deal);
    } else tabs.running.push(deal);
  }
  return tabs;
}

/**
 * Which tab the page opens on: the one asked for, else your turn when
 * anything is waiting on you, else the first with anything in it.
 */
export function openTab(
  asked: string | undefined,
  counts: Record<DealTab, number>,
): DealTab {
  return pickTab(asked, DEAL_TABS, counts);
}
