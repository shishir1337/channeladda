import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type {
  DealMode,
  KycStatus,
  OrderStatus,
  UserRole,
  WithdrawalStatus,
} from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { AGENT_HOLDS, TERMINAL_STATUSES } from "@/lib/deal-machine";
import { getSettings } from "@/server/settings";

/**
 * People, seen from the staff side.
 *
 * Deliberately a separate module from anything a member can reach. Every
 * function here is unscoped by design — it can read and change any account —
 * so it lives on its own and every caller has to go through a role gate first.
 *
 * The guards are in this file rather than in the UI, because the UI is not the
 * thing an attacker talks to.
 *
 * Two exceptions, both at the bottom and both marked: `peekStaffInvite` and
 * `acceptStaffInvite` are reachable by somebody with no account at all, which
 * is the point of an invitation. There the token is the gate.
 */

export const ROLES: readonly UserRole[] = [
  "USER",
  "AGENT",
  "MODERATOR",
  "FINANCE",
  "SUPERADMIN",
];

export const ROLE_LABELS: Record<UserRole, string> = {
  USER: "Member",
  AGENT: "Transfer agent",
  MODERATOR: "Moderator",
  FINANCE: "Finance",
  SUPERADMIN: "Superadmin",
};

export const ROLE_BLURBS: Record<UserRole, string> = {
  USER: "Buys and sells. No staff access.",
  AGENT: "Takes custody of channels and runs transfers. Deals only.",
  MODERATOR: "Listing queue, reports, conversations.",
  FINANCE: "Withdrawals, refunds, dispute payouts.",
  SUPERADMIN: "Everything, including fees and staff.",
};

/**
 * What granting each role actually lets somebody do to other people.
 *
 * Separate from the blurb on purpose: the blurb says what the desk is, this
 * says what you are handing over. A picker that only names the roles asks the
 * person clicking it to already know which of them can move money.
 */
export const ROLE_CONSEQUENCES: Record<UserRole, string> = {
  USER:
    "Removes every staff desk and signs them out of all their sessions at once. " +
    "They keep their account, their listings and their deals as a member.",
  AGENT:
    "They appear on the deal desk and can take unheld deals. On a Safest deal that means " +
    "they personally become the owner of a seller's channel until they transfer it on — " +
    "if that account is lost or locked, every channel they hold is stuck with it.",
  MODERATOR:
    "They can approve and take down listings, read any conversation between a buyer and a " +
    "seller, and suspend a member's account.",
  FINANCE:
    "They can send money out of the platform — payouts, refunds and dispute settlements — " +
    "and record a payment as received. This is the role that can lose real money.",
  SUPERADMIN:
    "Everything, with nothing above it: fees on every sale, who else is staff, and suspending " +
    "any account — including yours, by the person you are about to appoint.",
};

/** Roles that can be handed out as an invitation. A member just signs up. */
export const INVITABLE_ROLES: readonly UserRole[] = [
  "AGENT",
  "MODERATOR",
  "FINANCE",
  "SUPERADMIN",
];

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  slug: string | null;
  banned: boolean;
  banReason: string | null;
  emailVerified: boolean;
  kycStatus: KycStatus;
  createdAt: Date;
  listings: number;
  bought: number;
  sold: number;
};

export type UserFilter = {
  query?: string;
  /**
   * `TEAM` is everyone who is not a plain member, agents included. `STAFF` is
   * the narrower set that `requireStaff` lets through — it is kept because it
   * is what the filter link has always put in the URL, and because the two
   * really are different questions.
   */
  role?: UserRole | "STAFF" | "TEAM";
  status?: "banned" | "active";
  page?: number;
};

export const PAGE_SIZE = 25;

function whereFrom(filter: UserFilter) {
  const query = filter.query?.trim();
  return {
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { email: { contains: query, mode: "insensitive" as const } },
            { slug: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(filter.role === "STAFF"
      ? { role: { in: ["MODERATOR", "FINANCE", "SUPERADMIN"] as UserRole[] } }
      : filter.role === "TEAM"
        ? { role: { not: "USER" as UserRole } }
        : filter.role
          ? { role: filter.role }
          : {}),
    ...(filter.status === "banned"
      ? { bannedAt: { not: null } }
      : filter.status === "active"
        ? { bannedAt: null }
        : {}),
  };
}

export async function listUsers(filter: UserFilter = {}): Promise<{
  rows: UserRow[];
  total: number;
  page: number;
  pages: number;
}> {
  const page = Math.max(1, filter.page ?? 1);
  const where = whereFrom(filter);

  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: [{ role: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        slug: true,
        bannedAt: true,
        banReason: true,
        emailVerified: true,
        kycStatus: true,
        createdAt: true,
        _count: {
          select: { listings: true, ordersBought: true, ordersSold: true },
        },
      },
    }),
  ]);

  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      slug: row.slug,
      banned: row.bannedAt !== null,
      banReason: row.banReason,
      emailVerified: row.emailVerified,
      kycStatus: row.kycStatus,
      createdAt: row.createdAt,
      listings: row._count.listings,
      bought: row._count.ordersBought,
      sold: row._count.ordersSold,
    })),
  };
}

export type UserDetail = UserRow & {
  country: string | null;
  sessions: number;
  openThreads: number;
  flaggedThreads: number;
  reports: number;
  twoFactorEnabled: boolean;
  /** An agent's stored transfer identity, or null on anyone else. */
  agentEmail: string | null;
  agentBrand: string | null;
  /** Safest channels this person is holding right now, and the cap. */
  holds: number;
  maxHolds: number;
};

export async function getUserDetail(id: string): Promise<UserDetail | null> {
  const row = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      slug: true,
      country: true,
      bannedAt: true,
      banReason: true,
      emailVerified: true,
      twoFactorEnabled: true,
      agentEmail: true,
      agentBrand: true,
      kycStatus: true,
      createdAt: true,
      _count: {
        select: {
          listings: true,
          ordersBought: true,
          ordersSold: true,
          sessions: true,
        },
      },
    },
  });
  if (!row) return null;

  const [holds, settings] = await Promise.all([
    countAgentHolds(id),
    getSettings(),
  ]);

  const [openThreads, flaggedThreads, reports] = await Promise.all([
    db.conversation.count({
      where: { OR: [{ buyerId: id }, { sellerId: id }], closedAt: null },
    }),
    db.conversation.count({
      where: {
        OR: [{ buyerId: id }, { sellerId: id }],
        flaggedAt: { not: null },
      },
    }),
    db.report.count({ where: { reporterId: id } }),
  ]);

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    slug: row.slug,
    country: row.country,
    banned: row.bannedAt !== null,
    banReason: row.banReason,
    emailVerified: row.emailVerified,
    kycStatus: row.kycStatus,
    createdAt: row.createdAt,
    listings: row._count.listings,
    bought: row._count.ordersBought,
    sold: row._count.ordersSold,
    sessions: row._count.sessions,
    openThreads,
    flaggedThreads,
    reports,
    twoFactorEnabled: row.twoFactorEnabled,
    agentEmail: row.agentEmail,
    agentBrand: row.agentBrand,
    holds,
    maxHolds: settings.maxHoldsPerAgent,
  };
}

// -------------------------------------------------------------------- team

/**
 * Safest channels one agent is holding this second.
 *
 * Counted exactly the way `assignAgent` counts it when it enforces the cap —
 * same status list, same mode — because a staff screen saying "3 of 10" while
 * the assignment refuses at 3 would be worse than saying nothing.
 */
export async function countAgentHolds(userId: string): Promise<number> {
  return db.order.count({
    where: {
      agentId: userId,
      mode: "SAFEST",
      status: { in: [...AGENT_HOLDS] },
    },
  });
}

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  banned: boolean;
  banReason: string | null;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  createdAt: Date;
  agentEmail: string | null;
  agentBrand: string | null;
  /** Safest channels held right now. Only meaningful on an agent. */
  holds: number;
  /** Deals assigned and not finished, in either mode. */
  liveDeals: number;
};

export type Team = {
  members: TeamMember[];
  /** `PlatformSettings.maxHoldsPerAgent`, so the page can show "3 of 10". */
  maxHoldsPerAgent: number;
  /** Superadmins who are not suspended. One is a single point of failure. */
  activeSuperadmins: number;
};

/**
 * Everybody who is not a plain member.
 *
 * This did not exist. The only way to see who had access was to page through
 * every account, and the one number that decides whether Safest deals get
 * picked up — how many channels each agent is already holding against the cap
 * — was nowhere on the staff side at all.
 */
export async function listTeam(): Promise<Team> {
  const members = await db.user.findMany({
    where: { role: { not: "USER" } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      bannedAt: true,
      banReason: true,
      emailVerified: true,
      twoFactorEnabled: true,
      createdAt: true,
      agentEmail: true,
      agentBrand: true,
    },
  });

  const ids = members.map((member) => member.id);

  // Two grouped queries for the whole table rather than two per person.
  const [holds, live, settings] = await Promise.all([
    ids.length > 0
      ? db.order.groupBy({
          by: ["agentId"],
          where: {
            agentId: { in: ids },
            mode: "SAFEST",
            status: { in: [...AGENT_HOLDS] },
          },
          _count: { _all: true },
        })
      : [],
    ids.length > 0
      ? db.order.groupBy({
          by: ["agentId"],
          where: {
            agentId: { in: ids },
            status: { notIn: [...TERMINAL_STATUSES] },
          },
          _count: { _all: true },
        })
      : [],
    getSettings(),
  ]);

  const holdsBy = new Map(
    holds.map((row) => [row.agentId, row._count._all] as const),
  );
  const liveBy = new Map(
    live.map((row) => [row.agentId, row._count._all] as const),
  );

  return {
    maxHoldsPerAgent: settings.maxHoldsPerAgent,
    activeSuperadmins: members.filter(
      (member) => member.role === "SUPERADMIN" && member.bannedAt === null,
    ).length,
    members: members.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      banned: member.bannedAt !== null,
      banReason: member.banReason,
      emailVerified: member.emailVerified,
      twoFactorEnabled: member.twoFactorEnabled,
      createdAt: member.createdAt,
      agentEmail: member.agentEmail,
      agentBrand: member.agentBrand,
      holds: holdsBy.get(member.id) ?? 0,
      liveDeals: liveBy.get(member.id) ?? 0,
    })),
  };
}

export type GuardFailure =
  | "not-found"
  | "self"
  | "last-superadmin"
  | "outranked"
  | "no-change"
  | "not-an-agent";

export type AdminUserResult =
  | { ok: true; before: UserRole | boolean; after: UserRole | boolean }
  | { ok: false; reason: GuardFailure };

const STAFF_ROLES: readonly UserRole[] = ["MODERATOR", "FINANCE", "SUPERADMIN"];

/**
 * Every role that opens a door, which is a wider set than `STAFF_ROLES`.
 *
 * `AGENT` is not staff — it reaches the deal desk and nothing else — but it is
 * the role that takes custody of other people's channels, so removing it has
 * to end the sessions holding it. Without `AGENT` here, a demoted agent kept
 * working the deal desk until Better Auth's cookie cache happened to lapse.
 */
const ACCESS_ROLES: readonly UserRole[] = ["AGENT", ...STAFF_ROLES];

/**
 * Change what somebody can do.
 *
 * Two things must stay true no matter what gets called: a superadmin cannot
 * strip their own access (an accident that needs database surgery to undo),
 * and the last superadmin cannot be demoted by anyone, including themselves —
 * a platform with nobody who can set fees or appoint staff is bricked.
 */
export async function setUserRole(input: {
  actorId: string;
  userId: string;
  role: UserRole;
}): Promise<AdminUserResult> {
  if (input.actorId === input.userId) return { ok: false, reason: "self" };

  const target = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, role: true },
  });
  if (!target) return { ok: false, reason: "not-found" };
  if (target.role === input.role) return { ok: false, reason: "no-change" };

  if (target.role === "SUPERADMIN" && input.role !== "SUPERADMIN") {
    // Suspended superadmins do not count. They cannot sign in, so leaving the
    // platform with one of those and nobody else is the same brick as leaving
    // it with none — and this check used to allow exactly that, because it
    // counted the role and not whether the person could still use it.
    const remaining = await db.user.count({
      where: { role: "SUPERADMIN", bannedAt: null, id: { not: target.id } },
    });
    if (remaining === 0) return { ok: false, reason: "last-superadmin" };
  }

  await db.user.update({
    where: { id: target.id },
    data: {
      role: input.role,
      // A transfer identity belongs to an agent. Leaving it behind on a
      // demoted account would put a stale address in front of the next
      // seller who was told to invite it.
      ...(input.role === "AGENT" ? {} : { agentEmail: null, agentBrand: null }),
    },
  });

  // Losing access should take effect now, not whenever they happen to sign
  // out. Signing them out is the only thing that reliably does that.
  //
  // Keyed on what they *were*, not on whether the new role is narrower: a
  // moderator moved sideways to agent has also just lost every conversation
  // on the platform, and working out which pairs count as a demotion is a
  // judgement this does not need to make. Promoting a plain member keeps
  // their session — nothing is being taken away.
  if (ACCESS_ROLES.includes(target.role)) {
    await db.session.deleteMany({ where: { userId: target.id } });
  }

  return { ok: true, before: target.role, after: input.role };
}

/**
 * Suspend or restore an account.
 *
 * A moderator can suspend a member; only a superadmin can touch another staff
 * member, so a compromised moderator account cannot take the team offline.
 */
export async function setUserBanned(input: {
  actorId: string;
  actorRole: UserRole;
  userId: string;
  banned: boolean;
  reason: string | null;
}): Promise<AdminUserResult> {
  if (input.actorId === input.userId) return { ok: false, reason: "self" };

  const target = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, role: true, bannedAt: true },
  });
  if (!target) return { ok: false, reason: "not-found" };
  if ((target.bannedAt !== null) === input.banned) {
    return { ok: false, reason: "no-change" };
  }
  if (STAFF_ROLES.includes(target.role) && input.actorRole !== "SUPERADMIN") {
    return { ok: false, reason: "outranked" };
  }
  if (target.role === "SUPERADMIN" && input.banned) {
    const remaining = await db.user.count({
      where: { role: "SUPERADMIN", bannedAt: null, id: { not: target.id } },
    });
    if (remaining === 0) return { ok: false, reason: "last-superadmin" };
  }

  await db.user.update({
    where: { id: target.id },
    data: {
      bannedAt: input.banned ? new Date() : null,
      banReason: input.banned ? input.reason : null,
    },
  });

  if (input.banned) {
    // The session guard reads a cookie-cached session for up to a minute, so
    // deleting the rows is what actually ends the session rather than what
    // merely records that it should have ended.
    await db.session.deleteMany({ where: { userId: target.id } });
    // Their listings come down with them. Leaving a suspended seller's
    // accounts on the browse page is how the next person gets scammed.
    // Lifting the suspension does not put them back: the seller relists, so
    // nothing goes live again without somebody deciding it should. A
    // reserved listing is paused as well — its deal carries on, and if that
    // deal is cancelled the listing stays off the marketplace — and the
    // seller cannot resume it until the deal is over (setPaused).
    await db.listing.updateMany({
      where: { sellerId: target.id, status: { in: ["LIVE", "RESERVED"] } },
      data: { status: "PAUSED" },
    });
  }

  return { ok: true, before: target.bannedAt !== null, after: input.banned };
}

export async function countStaff(): Promise<number> {
  return db.user.count({ where: { role: { in: STAFF_ROLES as UserRole[] } } });
}

// ------------------------------------------------------- the account record

export type UserDeal = {
  id: string;
  reference: string;
  listingTitle: string;
  mode: DealMode;
  status: OrderStatus;
  /** Which side of the deal this person is on. */
  side: "buyer" | "seller" | "agent";
  /** Cents. What the buyer pays: price plus the buyer fee. */
  totalUsd: number;
  createdAt: Date;
};

/**
 * Every deal this person is part of — as buyer, seller or agent.
 *
 * The account page showed counts and no way to reach any of the deals behind
 * them, so "check this payout against the seller's history" meant leaving the
 * page and searching the deal desk by hand.
 */
export async function listUserDeals(
  userId: string,
  take = 25,
): Promise<{ deals: UserDeal[]; total: number }> {
  const where = {
    OR: [{ buyerId: userId }, { sellerId: userId }, { agentId: userId }],
  };
  const [total, rows] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        reference: true,
        mode: true,
        status: true,
        totalUsd: true,
        createdAt: true,
        buyerId: true,
        sellerId: true,
        listing: { select: { title: true } },
      },
    }),
  ]);

  return {
    total,
    deals: rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      listingTitle: row.listing.title,
      mode: row.mode,
      status: row.status,
      side:
        row.buyerId === userId
          ? "buyer"
          : row.sellerId === userId
            ? "seller"
            : "agent",
      totalUsd: row.totalUsd,
      createdAt: row.createdAt,
    })),
  };
}

export type UserWithdrawal = {
  id: string;
  /** Cents. */
  amountUsd: number;
  address: string;
  network: string;
  status: WithdrawalStatus;
  txHash: string | null;
  rejectNote: string | null;
  requestedAt: Date;
  settledAt: Date | null;
};

/**
 * Their payout history. Money only — the caller gates it to the roles that
 * can see money, exactly as `/admin/payouts` is gated, and must not fetch it
 * for anyone else.
 */
export async function listUserWithdrawals(
  userId: string,
  take = 25,
): Promise<UserWithdrawal[]> {
  return db.withdrawal.findMany({
    where: { userId },
    orderBy: { requestedAt: "desc" },
    take,
    select: {
      id: true,
      amountUsd: true,
      address: true,
      network: true,
      status: true,
      txHash: true,
      rejectNote: true,
      requestedAt: true,
      settledAt: true,
    },
  });
}

// ---------------------------------------------------------- staff remedies

/**
 * The result of one of the remedies below. `before`/`after` go into the
 * audit row as they are, so they are plain values rather than records.
 */
export type RemedyResult<T = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; reason: GuardFailure };

/** Statuses staff may set by hand. PENDING belongs to a submission flow. */
export const KYC_SETTABLE: readonly KycStatus[] = [
  "APPROVED",
  "REJECTED",
  "NOT_STARTED",
];

/**
 * Record the outcome of an identity check done off-platform.
 *
 * Nothing in the app ever wrote `kycStatus`, so it sat at NOT_STARTED on
 * every real account — and `server/sellers.ts` filters the public sellers
 * directory and the homepage's top sellers on APPROVED, which means both were
 * empty on any database that had not been seeded. This is the missing write.
 *
 * Rank-checked like a suspension: a moderator may record a member's check,
 * only a superadmin a colleague's, and nobody their own.
 */
export async function setKycStatus(input: {
  actorId: string;
  actorRole: UserRole;
  userId: string;
  status: KycStatus;
  reason: string;
}): Promise<RemedyResult<{ before: KycStatus; after: KycStatus }>> {
  if (input.actorId === input.userId) return { ok: false, reason: "self" };

  const target = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, role: true, kycStatus: true },
  });
  if (!target) return { ok: false, reason: "not-found" };
  if (STAFF_ROLES.includes(target.role) && input.actorRole !== "SUPERADMIN") {
    return { ok: false, reason: "outranked" };
  }
  if (target.kycStatus === input.status) {
    return { ok: false, reason: "no-change" };
  }

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: { kycStatus: input.status },
    });
    // A submission, if there ever is one, must not disagree with the account.
    // Nothing creates these today; when something does, this keeps the two in
    // step rather than leaving a PENDING row under an APPROVED person.
    if (input.status !== "NOT_STARTED") {
      await tx.kycSubmission.updateMany({
        where: { userId: target.id },
        data: {
          status: input.status,
          reviewerId: input.actorId,
          reviewNote: input.reason,
          reviewedAt: new Date(),
        },
      });
    }
  });

  return { ok: true, before: target.kycStatus, after: input.status };
}

/**
 * Somebody lost the phone their codes were on.
 *
 * Better Auth's two-factor plugin keeps the secret and backup codes on a
 * TwoFactor row and the switch on `User.twoFactorEnabled`; this clears both,
 * which is what the plugin's own "disable" does. Their sessions end too, so
 * the next sign-in anywhere is a fresh one on the password alone, and they
 * can enrol a new device from Security.
 *
 * SUPERADMIN only, at the action. Never on yourself — a superadmin locked out
 * of their own second factor is exactly who should need a colleague. And
 * never the last superadmin who can still sign in, which cannot actually
 * arise (the actor is one, and is not the target) but is written down here so
 * that stays true if who may call this ever widens.
 */
export async function resetTwoFactor(input: {
  actorId: string;
  userId: string;
}): Promise<RemedyResult<{ sessionsEnded: number }>> {
  if (input.actorId === input.userId) return { ok: false, reason: "self" };

  const target = await db.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      role: true,
      twoFactorEnabled: true,
      _count: { select: { twoFactors: true } },
    },
  });
  if (!target) return { ok: false, reason: "not-found" };
  if (!target.twoFactorEnabled && target._count.twoFactors === 0) {
    return { ok: false, reason: "no-change" };
  }
  if (target.role === "SUPERADMIN") {
    const others = await db.user.count({
      where: { role: "SUPERADMIN", bannedAt: null, id: { not: target.id } },
    });
    if (others === 0) return { ok: false, reason: "last-superadmin" };
  }

  const sessionsEnded = await db.$transaction(async (tx) => {
    await tx.twoFactor.deleteMany({ where: { userId: target.id } });
    await tx.user.update({
      where: { id: target.id },
      data: { twoFactorEnabled: false },
    });
    const ended = await tx.session.deleteMany({
      where: { userId: target.id },
    });
    return ended.count;
  });

  return { ok: true, sessionsEnded };
}

/**
 * Vouch for an address by hand.
 *
 * Unverified accounts cannot make an offer, and with no mail provider
 * configured the verification email never arrives — so until now an
 * unverified buyer was simply stuck. Staff confirming the address another way
 * (they wrote in from it, a support ticket, a call) is the remedy.
 */
export async function markEmailVerified(input: {
  actorId: string;
  userId: string;
}): Promise<RemedyResult<{ email: string }>> {
  if (input.actorId === input.userId) return { ok: false, reason: "self" };

  const target = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, emailVerified: true },
  });
  if (!target) return { ok: false, reason: "not-found" };
  if (target.emailVerified) return { ok: false, reason: "no-change" };

  await db.user.update({
    where: { id: target.id },
    data: { emailVerified: true, emailVerifiedAt: new Date() },
  });

  return { ok: true, email: target.email };
}

/**
 * Sign somebody out of every device.
 *
 * For "I think someone else is in my account" and "I signed in on a shared
 * computer" — the two cases support hears where suspending is far too much.
 * Suspension already does this as part of itself.
 *
 * Rank-checked like a suspension: signing a superadmin out repeatedly is a
 * nuisance a compromised moderator account should not be able to cause.
 */
export async function endSessions(input: {
  actorId: string;
  actorRole: UserRole;
  userId: string;
}): Promise<RemedyResult<{ ended: number }>> {
  if (input.actorId === input.userId) return { ok: false, reason: "self" };

  const target = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, role: true },
  });
  if (!target) return { ok: false, reason: "not-found" };
  if (STAFF_ROLES.includes(target.role) && input.actorRole !== "SUPERADMIN") {
    return { ok: false, reason: "outranked" };
  }

  const ended = await db.session.deleteMany({ where: { userId: target.id } });
  if (ended.count === 0) return { ok: false, reason: "no-change" };

  return { ok: true, ended: ended.count };
}

// --------------------------------------------------------- agent identity

export type AgentIdentity = { email: string; brand: string } | null;

/**
 * An agent's stored transfer identity.
 *
 * The address a seller is told to invite as channel owner, and the name it is
 * shown under. Before this it was typed into a text box per deal, so one agent
 * reached three sellers as three different people, and a seller who invited a
 * mistyped address handed the channel to nobody and waited.
 *
 * Only ever set on an AGENT: on anyone else it is a stale address waiting to
 * be put in front of somebody, so `setUserRole` clears it on the way out.
 */
export async function setAgentIdentity(input: {
  userId: string;
  email: string;
  brand: string;
}): Promise<
  | { ok: true; before: AgentIdentity; after: AgentIdentity }
  | { ok: false; reason: GuardFailure }
> {
  const email = input.email.trim().toLowerCase();
  const brand = input.brand.trim();

  const target = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, role: true, agentEmail: true, agentBrand: true },
  });
  if (!target) return { ok: false, reason: "not-found" };
  if (target.role !== "AGENT") return { ok: false, reason: "not-an-agent" };
  if (target.agentEmail === email && target.agentBrand === brand) {
    return { ok: false, reason: "no-change" };
  }

  await db.user.update({
    where: { id: target.id },
    data: { agentEmail: email, agentBrand: brand },
  });

  return {
    ok: true,
    before:
      target.agentEmail && target.agentBrand
        ? { email: target.agentEmail, brand: target.agentBrand }
        : null,
    after: { email, brand },
  };
}

/**
 * What a deal should be assigned under, for this agent.
 *
 * Here rather than in the deal desk so there is one answer to "what address
 * does this agent use", and so the deal desk can fall back to the sign-in
 * address for an agent nobody has set one on yet.
 */
export async function agentIdentity(userId: string): Promise<AgentIdentity> {
  const row = await db.user.findUnique({
    where: { id: userId },
    select: { agentEmail: true, agentBrand: true },
  });
  if (!row?.agentEmail || !row.agentBrand) return null;
  return { email: row.agentEmail, brand: row.agentBrand };
}

/** Agents who can be given a deal, with their stored identity and load. */
export type AssignableAgent = {
  id: string;
  name: string;
  email: string;
  agentEmail: string | null;
  agentBrand: string | null;
  holds: number;
  atCap: boolean;
};

/**
 * Agents available to take a Safest channel, cap included.
 *
 * Exported for the deal desk, which currently asks whoever is assigning to
 * type a user id copied off an account page.
 */
export async function listAssignableAgents(): Promise<{
  agents: AssignableAgent[];
  maxHoldsPerAgent: number;
}> {
  const { members, maxHoldsPerAgent } = await listTeam();
  return {
    maxHoldsPerAgent,
    agents: members
      .filter((member) => member.role === "AGENT" && !member.banned)
      .map((member) => ({
        id: member.id,
        name: member.name,
        email: member.email,
        agentEmail: member.agentEmail,
        agentBrand: member.agentBrand,
        holds: member.holds,
        atCap: member.holds >= maxHoldsPerAgent,
      })),
  };
}

// ------------------------------------------------------------- invitations

/** Long enough that guessing is not a strategy; short enough to paste. */
const TOKEN_BYTES = 32;

/** Long enough to reach somebody across a weekend, short enough to matter. */
const INVITE_TTL_HOURS = 72;

/**
 * A staff account can appoint staff or move money, so it gets the same floor
 * `scripts/create-admin.ts` insists on rather than the ten characters the
 * public sign-up screen asks a buyer for.
 */
export const MIN_STAFF_PASSWORD = 12;

function fingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type InviteRow = {
  id: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  expiresAt: Date;
  expired: boolean;
  invitedByName: string | null;
};

/** Outstanding invitations: neither accepted nor revoked. Expired ones stay. */
export async function listPendingInvites(): Promise<InviteRow[]> {
  const rows = await db.staffInvite.findMany({
    where: { acceptedAt: null, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      expiresAt: true,
      invitedBy: { select: { name: true } },
    },
  });

  const now = Date.now();
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    expired: row.expiresAt.getTime() <= now,
    invitedByName: row.invitedBy?.name ?? null,
  }));
}

export type CreateInviteFailure =
  | "bad-email"
  | "not-invitable"
  | "account-exists";

export type CreateInviteResult =
  | {
      ok: true;
      id: string;
      email: string;
      role: UserRole;
      expiresAt: Date;
      /**
       * The raw token. Returned exactly once, from this call, and never
       * stored, logged or emailed — only the fingerprint is kept, so there is
       * no second chance to read it and nothing in the database to steal.
       */
      token: string;
      /** Earlier outstanding invitations for this address, now revoked. */
      replaced: number;
    }
  | { ok: false; reason: CreateInviteFailure };

/**
 * Invite somebody onto the team.
 *
 * Deliberately an invitation rather than "create an account with a password
 * and hand it over": a password typed by one person for another is known to
 * two people for as long as the account exists, which makes "who approved
 * that payout" unanswerable on exactly the roles where it matters most. The
 * invitee sets their own, and the platform never sees one.
 *
 * Re-inviting an address revokes whatever was outstanding for it, because the
 * thing a superadmin actually wants when they come back here is "that link
 * went astray, give me another".
 */
export async function createStaffInvite(input: {
  actorId: string;
  email: string;
  role: UserRole;
  ttlHours?: number;
}): Promise<CreateInviteResult> {
  const email = input.email.trim().toLowerCase();
  // Not a validation library: the address has to be delivered by hand anyway,
  // so this only catches the typo that would create an unusable row.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, reason: "bad-email" };
  }
  if (!INVITABLE_ROLES.includes(input.role)) {
    return { ok: false, reason: "not-invitable" };
  }

  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) return { ok: false, reason: "account-exists" };

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(
    Date.now() + (input.ttlHours ?? INVITE_TTL_HOURS) * 3_600_000,
  );

  const { replaced, invite } = await db.$transaction(async (tx) => {
    const superseded = await tx.staffInvite.updateMany({
      where: { email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: input.actorId },
    });
    const created = await tx.staffInvite.create({
      data: {
        email,
        role: input.role,
        tokenHash: fingerprint(token),
        expiresAt,
        invitedById: input.actorId,
      },
      select: { id: true },
    });
    return { replaced: superseded.count, invite: created };
  });

  return {
    ok: true,
    id: invite.id,
    email,
    role: input.role,
    expiresAt,
    token,
    replaced,
  };
}

export type RevokeInviteResult =
  | { ok: true; email: string; role: UserRole }
  | { ok: false; reason: "not-found" };

export async function revokeStaffInvite(input: {
  actorId: string;
  inviteId: string;
}): Promise<RevokeInviteResult> {
  const invite = await db.staffInvite.findUnique({
    where: { id: input.inviteId },
    select: { id: true, email: true, role: true },
  });
  if (!invite) return { ok: false, reason: "not-found" };

  // Guarded in the update rather than read-then-write: an invitation accepted
  // between the two must not come back as revoked.
  const done = await db.staffInvite.updateMany({
    where: { id: invite.id, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date(), revokedById: input.actorId },
  });
  if (done.count !== 1) return { ok: false, reason: "not-found" };

  return { ok: true, email: invite.email, role: invite.role };
}

export type InvitePreview = { email: string; role: UserRole; expiresAt: Date };

/**
 * What an invitation is for, without accepting it.
 *
 * Takes the raw token from the link, so it is reachable by somebody with no
 * account — which is the whole point — and tells them nothing they were not
 * already holding the token for.
 */
export async function peekStaffInvite(
  token: string,
): Promise<InvitePreview | null> {
  const invite = await db.staffInvite.findUnique({
    where: { tokenHash: fingerprint(token) },
    select: {
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
    },
  });
  if (!invite) return null;
  if (invite.acceptedAt || invite.revokedAt) return null;
  if (invite.expiresAt.getTime() <= Date.now()) return null;
  return {
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
  };
}

/** Lost the race to claim the invitation. Not an error worth a stack trace. */
class InviteRace extends Error {}

export type AcceptInviteFailure =
  | "bad-token"
  | "weak-password"
  | "no-name"
  | "account-exists";

export type AcceptInviteResult =
  | { ok: true; userId: string; email: string; role: UserRole }
  | { ok: false; reason: AcceptInviteFailure };

/**
 * Accept an invitation and become that account.
 *
 * The one function in this module that is reachable by somebody with no
 * session, and it is safe to be: the token is the authorisation, it is
 * single-use, it expires, it can be revoked, and it can only ever produce the
 * address and the role a superadmin already wrote down.
 *
 * Every failure collapses to `bad-token`. Expired, revoked, already used and
 * never existed are four different facts, and telling an anonymous caller
 * which one they hit turns this into an oracle for guessing tokens.
 *
 * The account is built the way `scripts/create-admin.ts` builds one — Better
 * Auth keeps the password on Account, hashed with its own `hashPassword`, and
 * looks it up by (providerId, accountId) — rather than going through the sign-up
 * endpoint, which would try to send a verification email that may have
 * nowhere to go.
 */
export async function acceptStaffInvite(input: {
  token: string;
  name: string;
  password: string;
}): Promise<AcceptInviteResult> {
  const name = input.name.trim();
  if (name.length < 2) return { ok: false, reason: "no-name" };
  if (input.password.length < MIN_STAFF_PASSWORD) {
    return { ok: false, reason: "weak-password" };
  }

  const invite = await db.staffInvite.findUnique({
    where: { tokenHash: fingerprint(input.token) },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
    },
  });
  if (
    !invite ||
    invite.acceptedAt ||
    invite.revokedAt ||
    invite.expiresAt.getTime() <= Date.now()
  ) {
    return { ok: false, reason: "bad-token" };
  }

  // Hashing is deliberately outside the transaction: it is meant to be slow,
  // and holding a write transaction open for it would be a lock nobody needs.
  const password = await hashPassword(input.password);

  try {
    const userId = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: invite.email,
          name,
          // The superadmin typed this address and handed the link over
          // themselves, which is a stronger assertion than a click on a
          // link sent to it — and there may be no mail provider to send one.
          emailVerified: true,
          emailVerifiedAt: new Date(),
          role: invite.role,
        },
        select: { id: true },
      });

      await tx.account.create({
        data: {
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password,
          updatedAt: new Date(),
        },
      });

      // Claimed under the same guard the read used, so two people opening
      // one link at once produce one account rather than two.
      const claimed = await tx.staffInvite.updateMany({
        where: { id: invite.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date(), acceptedUserId: user.id },
      });
      if (claimed.count !== 1) throw new InviteRace();

      return user.id;
    });

    return { ok: true, userId, email: invite.email, role: invite.role };
  } catch (error) {
    if (error instanceof InviteRace) return { ok: false, reason: "bad-token" };
    // The unique index on email, which is the only way two people signing up
    // at once can collide here.
    if ((error as { code?: string }).code === "P2002") {
      return { ok: false, reason: "account-exists" };
    }
    throw error;
  }
}
