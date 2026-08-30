import "server-only";

import { db } from "@/lib/db";
import { REPORT_REASONS, type ReportReason } from "@/lib/reports";

/**
 * Reports raised by users.
 *
 * A report that nobody can read is the same as no report, except the person
 * who sent it thinks something is happening. So this writes a row *and* the
 * staff overview shows it — the two belong together and neither ships alone.
 */

export { REPORT_REASONS, type ReportReason };

export type ReportResult =
  | { ok: true; already: boolean }
  | { ok: false; reason: "not-found" | "own-listing" };

export async function reportListing(input: {
  reporterId: string;
  listingId: string;
  reason: string;
  detail: string | null;
}): Promise<ReportResult> {
  const listing = await db.listing.findUnique({
    where: { id: input.listingId },
    select: { id: true, sellerId: true },
  });
  if (!listing) return { ok: false, reason: "not-found" };
  if (listing.sellerId === input.reporterId) {
    return { ok: false, reason: "own-listing" };
  }

  // One open report per person per listing. Someone hitting the button twice
  // should not turn into two items in a moderator's queue.
  const existing = await db.report.findFirst({
    where: {
      reporterId: input.reporterId,
      entity: "listing",
      entityId: input.listingId,
      resolvedAt: null,
    },
    select: { id: true },
  });
  if (existing) return { ok: true, already: true };

  await db.report.create({
    data: {
      reporterId: input.reporterId,
      entity: "listing",
      entityId: input.listingId,
      reason: input.reason,
      detail: input.detail,
    },
  });
  return { ok: true, already: false };
}

export type OpenReport = {
  id: string;
  reason: string;
  detail: string | null;
  createdAt: Date;
  listingId: string;
  listingHandle: string;
  listingTitle: string;
  listingStatus: string;
  reporterName: string;
};

export async function getOpenReports(take = 20): Promise<OpenReport[]> {
  const rows = await db.report.findMany({
    where: { entity: "listing", resolvedAt: null },
    orderBy: { createdAt: "asc" },
    take,
    select: {
      id: true,
      reason: true,
      detail: true,
      createdAt: true,
      entityId: true,
      reporterId: true,
    },
  });
  if (rows.length === 0) return [];

  // The Report table points at an entity by id rather than by relation, since
  // it can describe a user as easily as a listing. Resolve the listings in one
  // query rather than one per row.
  const [listings, reporters] = await Promise.all([
    db.listing.findMany({
      where: { id: { in: rows.map((r) => r.entityId) } },
      select: { id: true, handle: true, title: true, status: true },
    }),
    db.user.findMany({
      where: { id: { in: rows.map((r) => r.reporterId) } },
      select: { id: true, name: true },
    }),
  ]);
  const listingBy = new Map(listings.map((l) => [l.id, l]));
  const reporterBy = new Map(reporters.map((u) => [u.id, u.name]));

  return rows.map((row) => {
    const listing = listingBy.get(row.entityId);
    return {
      id: row.id,
      reason: row.reason,
      detail: row.detail,
      createdAt: row.createdAt,
      listingId: row.entityId,
      listingHandle: listing?.handle ?? "(deleted)",
      listingTitle: listing?.title ?? "",
      listingStatus: listing?.status ?? "GONE",
      reporterName: reporterBy.get(row.reporterId) ?? "Someone",
    };
  });
}

export async function countOpenReports(): Promise<number> {
  return db.report.count({ where: { entity: "listing", resolvedAt: null } });
}

export async function resolveReport(id: string) {
  const updated = await db.report.updateMany({
    where: { id, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });
  return { ok: updated.count === 1 };
}
