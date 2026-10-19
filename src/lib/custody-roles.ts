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

/** Cents. Strict bands: each price belongs to exactly one level. */
const LEVEL_2_FROM = 1_000_000; // $10,000
const LEVEL_3_FROM = 10_000_000; // $100,000

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
  UNDER_10K: "Level 1 · under $10K",
  UNDER_100K: "Level 2 · $10K to $100K",
  FROM_100K: "Level 3 · $100K and up",
};

export function levelLabel(level: DealLevel | null): string {
  return level ? LABELS[level] : "Any size";
}

export const DEAL_LEVELS: readonly DealLevel[] = [
  "UNDER_10K",
  "UNDER_100K",
  "FROM_100K",
];
