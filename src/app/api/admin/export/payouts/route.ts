import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";
import { exportPayouts, parseMonth } from "@/server/admin-money";
import { recordAudit } from "@/server/audit";
import { requireRole } from "@/server/session";

/**
 * Every payout marked as sent in one month, as CSV.
 *
 *   GET /api/admin/export/payouts?month=2026-10
 *
 * One row per withdrawal, with the address and the transaction hash finance
 * recorded — what an accountant reconciles against the wallet's own history.
 *
 * FINANCE and SUPERADMIN only; anybody else signed in gets a 404, and
 * `exportPayouts` checks the role a second time against the database.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const staff = await requireRole("FINANCE");
  const month = parseMonth(request.nextUrl.searchParams.get("month"));

  const file = await exportPayouts(month, staff.id);
  if (!file.ok) notFound();

  await recordAudit({
    actorId: staff.id,
    action: "money.payouts_exported",
    entity: "user",
    entityId: staff.id,
    after: { month: month.key, rows: file.rows },
  });

  return new Response(file.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
