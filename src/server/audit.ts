import "server-only";

import { headers } from "next/headers";
import { db } from "@/lib/db";

/**
 * The record of who did what.
 *
 * Written on every privileged action as it happens, not reconstructed later
 * from other tables. When a seller says "my listing was rejected and nobody
 * told me why", this is the only thing that answers it.
 *
 * Rows are never updated or deleted — an audit trail that can be edited is not
 * one. There is deliberately no update or delete helper here.
 */
export type AuditEntry = {
  actorId: string;
  action: string;
  entity:
    | "listing"
    | "user"
    | "order"
    | "withdrawal"
    | "dispute"
    | "kyc"
    | "conversation";
  entityId: string;
  before?: unknown;
  after?: unknown;
};

/**
 * Best effort, and deliberately so: a failure to write the log must not undo
 * the action it describes. A moderator approving a listing should not see it
 * bounce because the audit insert hit a constraint. The failure is logged
 * loudly instead.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  // The IP is a nice-to-have; the row is not. `headers()` throws outside a
  // request scope — a background job, a script, a queue worker — and letting
  // that failure escape would mean the trail silently has holes exactly where
  // automated actions happened.
  let ip: string | null = null;
  try {
    const headerList = await headers();
    ip =
      headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerList.get("x-real-ip") ??
      null;
  } catch {
    // No request context. Carry on without it.
  }

  try {
    await db.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before:
          entry.before === undefined
            ? undefined
            : JSON.parse(JSON.stringify(entry.before)),
        after:
          entry.after === undefined
            ? undefined
            : JSON.parse(JSON.stringify(entry.after)),
        ip,
      },
    });
  } catch (error) {
    console.error(
      `[audit] failed to record ${entry.action} on ${entry.entity}:${entry.entityId}`,
      error,
    );
  }
}

export type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  actorName: string | null;
  createdAt: Date;
  before: unknown;
  after: unknown;
  /**
   * Where to send someone who clicks this row, or null when there is nowhere
   * to send them.
   *
   * An audit row outlives what it describes — that is the point of one — so a
   * listing named here may have been deleted, and a settings change was never
   * a listing at all. Both used to be linked to /admin/listings/<id> and both
   * 404'd.
   */
  targetHref: string | null;
};

/** Most recent first. Used by the admin audit view. */
export async function getAuditTrail(
  filter: { entity?: string; entityId?: string } = {},
  take = 50,
): Promise<AuditRow[]> {
  const rows = await db.auditLog.findMany({
    where: {
      ...(filter.entity ? { entity: filter.entity } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
    },
    select: {
      id: true,
      action: true,
      entity: true,
      entityId: true,
      createdAt: true,
      before: true,
      after: true,
      actor: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });

  // One query for the whole page rather than one per row.
  const listingIds = rows
    .filter((row) => row.entity === "listing")
    .map((row) => row.entityId);
  const alive = new Set(
    listingIds.length > 0
      ? (
          await db.listing.findMany({
            where: { id: { in: listingIds } },
            select: { id: true },
          })
        ).map((l) => l.id)
      : [],
  );

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    actorName: row.actor?.name ?? null,
    createdAt: row.createdAt,
    before: row.before,
    after: row.after,
    targetHref:
      row.entity === "listing" && alive.has(row.entityId)
        ? `/admin/listings/${row.entityId}`
        : null,
  }));
}
