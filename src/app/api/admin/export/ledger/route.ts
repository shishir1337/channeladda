import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";
import { exportLedger, parseMonth } from "@/server/admin-money";
import { recordAudit } from "@/server/audit";
import { requireRole } from "@/server/session";

/**
 * Every ledger row written in one month, as CSV, for the accountant.
 *
 *   GET /api/admin/export/ledger?month=2026-10
 *
 * FINANCE and SUPERADMIN only. Anybody else signed in gets a 404, the same
 * answer the staff pages give, because saying "this exists but not for you"
 * tells a stranger where to aim. `exportLedger` checks the role a second
 * time against the database before it reads a row.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const staff = await requireRole("FINANCE");
  const month = parseMonth(request.nextUrl.searchParams.get("month"));

  const file = await exportLedger(month, staff.id);
  if (!file.ok) notFound();

  // A read, but a bulk one: it carries every member's email. Downloading it
  // belongs on the record next to the decisions it is used to check.
  await recordAudit({
    actorId: staff.id,
    action: "money.ledger_exported",
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
