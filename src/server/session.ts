import "server-only";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { UserRole } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth";

/**
 * Who is asking.
 *
 * Every dashboard page and every mutation goes through one of these. The
 * session is read from `auth.api` against the request headers rather than from
 * anything the client sent us, so a forged cookie fails here rather than deeper
 * in.
 *
 * These deliberately use `redirect` and `notFound` rather than Next's
 * `unauthorized()` / `forbidden()`, which are still behind the experimental
 * `authInterrupts` flag. Access control for a marketplace holding other
 * people's money should not rest on a canary API.
 */
export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  emailVerified: boolean;
  role: UserRole;
  slug: string | null;
  banned: boolean;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const user = session.user as typeof session.user & {
    role?: string | null;
    slug?: string | null;
    bannedAt?: Date | string | null;
  };

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image ?? null,
    emailVerified: user.emailVerified,
    role: (user.role ?? "USER") as UserRole,
    slug: user.slug ?? null,
    banned: Boolean(user.bannedAt),
  };
}

/**
 * For pages that only make sense signed in. `next` carries the visitor back to
 * where they were aiming once they have signed in.
 */
export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(next ? `/signin?next=${encodeURIComponent(next)}` : "/signin");
  }
  if (user.banned) redirect("/support?reason=account-suspended");
  return user;
}

const STAFF: readonly UserRole[] = ["MODERATOR", "FINANCE", "SUPERADMIN"];

/** Any staff desk. Use `requireRole` when one specific desk is meant. */
export async function requireStaff(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!STAFF.includes(user.role)) notFound();
  return user;
}

/**
 * A wrong role gets a 404 rather than a "forbidden" page: telling someone that
 * an admin route exists but is closed to them is information they have no use
 * for and an attacker does.
 *
 * SUPERADMIN passes every check — it is the role that grants the others, so
 * denying it a narrower desk would be meaningless.
 */
export async function requireRole(
  ...allowed: readonly UserRole[]
): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "SUPERADMIN" && !allowed.includes(user.role)) notFound();
  return user;
}

/**
 * The narrowest gate. Fees, roles and bans.
 *
 * Spelled out rather than `requireRole()` with no arguments — that happens to
 * work, but an access check should say what it allows, not rely on a reader
 * working out what an empty list means.
 */
export async function requireSuperadmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "SUPERADMIN") notFound();
  return user;
}
