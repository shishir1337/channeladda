import type { DealLevel, UserRole } from "@/generated/prisma/enums";

/**
 * Who may run a deal as its agent, and which deals.
 *
 * Agents were the only people who could, so a superadmin or a moderator with
 * a quiet afternoon could not pick a deal up and the queue waited. The owner
 * runs deals with the team they have: moderators take them too, each at a
 * level set by deal size. Finance stays out — it moves the money, and the
 * person releasing a payout should not also be the one holding the channel.
 */
export const CUSTODIAN_ROLES: readonly UserRole[] = [
  "AGENT",
  "MODERATOR",
  "SUPERADMIN",
];

export function isCustodianRole(role: UserRole): boolean {
  return CUSTODIAN_ROLES.includes(role);
}

/**
 * Who may end a deal's waiting period early: the moderators, and the owner.
 * Not an agent — the person holding the channel does not cut short the wait
 * that protects the other side — and not finance.
 */
export function mayEndHolds(role: UserRole): boolean {
  return role === "MODERATOR" || role === "SUPERADMIN";
}

/**
 * Cents. Strict bands: each price belongs to exactly one level.
 *
 * The level names (UNDER_10K, UNDER_100K, FROM_100K) are historical: they
 * date from the first bands, at $10,000 and $100,000, and are kept because
 * they are stored on each user. The amounts here are the ones that apply.
 */
const LEVEL_2_FROM = 10_000; // $100
const LEVEL_3_FROM = 100_000; // $1,000

export function levelFor(priceCents: number): DealLevel {
  if (priceCents >= LEVEL_3_FROM) return "FROM_100K";
  if (priceCents >= LEVEL_2_FROM) return "UNDER_100K";
  return "UNDER_10K";
}

/**
 * Whether somebody at this level may take a deal at this price.
 *
 * No level means any size: that is how agents worked before levels, and a
 * deal in flight must not lose its agent to a rule that arrived after it.
 * The superadmin is never limited — it is the role that sets the levels.
 */
export function withinLevel(
  level: DealLevel | null,
  role: UserRole,
  priceCents: number,
): boolean {
  if (role === "SUPERADMIN" || level === null) return true;
  return levelFor(priceCents) === level;
}

const LABELS: Record<DealLevel, string> = {
  UNDER_10K: "Level 1 · under $100",
  UNDER_100K: "Level 2 · $100 to $1,000",
  FROM_100K: "Level 3 · $1,000 and up",
};

export function levelLabel(level: DealLevel | null): string {
  return level ? LABELS[level] : "Any size";
}

export const DEAL_LEVELS: readonly DealLevel[] = [
  "UNDER_10K",
  "UNDER_100K",
  "FROM_100K",
];

/**
 * One agent's load against the hold cap, in words.
 *
 * Team said "11 of 10 · At cap" for an agent over it (QA): over the limit
 * is its own state, and says so first, with the figures after.
 */
export function capLoad(
  holds: number,
  cap: number,
): { state: "over" | "at" | "near" | "free"; line: string } {
  if (holds > cap) {
    return { state: "over", line: `Over the limit (${holds} of ${cap})` };
  }
  if (holds === cap)
    return { state: "at", line: `At the limit (${holds} of ${cap})` };
  if (holds >= cap - 1) return { state: "near", line: `${holds} of ${cap}` };
  return { state: "free", line: `${holds} of ${cap}` };
}

/**
 * The warning beside a hold cap being lowered below what agents already
 * hold. Not a refusal: they keep what they hold, and take nothing more
 * until they are back under it. Null when nobody would be over it.
 */
export function capWarning(
  cap: number,
  holdsByAgent: readonly number[],
): string | null {
  if (!Number.isInteger(cap) || cap < 0) return null;
  const over = holdsByAgent.filter((holds) => holds > cap);
  if (over.length === 0) return null;
  const most = Math.max(...over);
  const who =
    over.length === 1
      ? `One agent already holds ${most}`
      : `${over.length} agents already hold more — up to ${most}`;
  return `${who}. They keep what they hold, but cannot take another deal until they are under ${cap}.`;
}
