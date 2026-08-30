import "server-only";

import type { UserRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

/**
 * People, seen from the staff side.
 *
 * Deliberately a separate module from anything a member can reach. Every
 * function here is unscoped by design — it can read and change any account —
 * so it lives on its own and every caller has to go through a role gate first.
 *
 * The guards are in this file rather than in the UI, because the UI is not the
 * thing an attacker talks to.
 */

export const ROLES: readonly UserRole[] = [
  "USER",
  "MODERATOR",
  "FINANCE",
  "SUPERADMIN",
];

export const ROLE_LABELS: Record<UserRole, string> = {
  USER: "Member",
  MODERATOR: "Moderator",
  FINANCE: "Finance",
  SUPERADMIN: "Superadmin",
};

export const ROLE_BLURBS: Record<UserRole, string> = {
  USER: "Buys and sells. No staff access.",
  MODERATOR: "Listing queue, reports, conversations.",
  FINANCE: "Withdrawals, refunds, dispute payouts.",
  SUPERADMIN: "Everything, including fees and staff.",
};

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  slug: string | null;
  banned: boolean;
  banReason: string | null;
  emailVerified: boolean;
  kycStatus: string;
  createdAt: Date;
  listings: number;
  bought: number;
  sold: number;
};

export type UserFilter = {
  query?: string;
  role?: UserRole | "STAFF";
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
  };
}

export type GuardFailure =
  | "not-found"
  | "self"
  | "last-superadmin"
  | "outranked"
  | "no-change";

export type AdminUserResult =
  | { ok: true; before: UserRole | boolean; after: UserRole | boolean }
  | { ok: false; reason: GuardFailure };

const STAFF_ROLES: readonly UserRole[] = ["MODERATOR", "FINANCE", "SUPERADMIN"];

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
    const remaining = await db.user.count({
      where: { role: "SUPERADMIN", id: { not: target.id } },
    });
    if (remaining === 0) return { ok: false, reason: "last-superadmin" };
  }

  await db.user.update({
    where: { id: target.id },
    data: { role: input.role },
  });

  // Losing staff access should take effect now, not whenever they happen to
  // sign out. Signing them out is the only thing that reliably does that.
  if (STAFF_ROLES.includes(target.role) && !STAFF_ROLES.includes(input.role)) {
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
    // nothing goes live again without somebody deciding it should.
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
