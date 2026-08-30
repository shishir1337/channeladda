import { DatabaseSetup } from "@/components/site/database-setup";
import { isDatabaseReachable } from "@/lib/db";

/**
 * Guard for pages that read from Postgres.
 *
 * Next sanitises errors thrown inside Server Components before they reach
 * `error.tsx`, so a dead database otherwise surfaces as an anonymous 500 with
 * nothing to act on. Checking here turns that into one actionable screen.
 *
 * Applied per page rather than in the layout, so pages that need no data —
 * fees, the policies, how-it-works — keep working with the database down.
 *
 * Usage, as the first line of a DB-backed page:
 *
 *     const gate = await databaseGate();
 *     if (gate) return gate;
 */
export async function databaseGate() {
  // In production an unreachable database is a real incident, not a setup
  // step, and belongs in the normal error path.
  if (process.env.NODE_ENV === "production") return null;
  return (await isDatabaseReachable()) ? null : <DatabaseSetup />;
}
