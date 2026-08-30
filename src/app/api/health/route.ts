import { db } from "@/lib/db";

/**
 * Liveness and readiness in one.
 *
 * A process that is up but cannot reach Postgres serves errors on every page
 * that matters, so "is the port open" is not a useful health check for this
 * app. This asks the database a question and only reports healthy if it
 * answers.
 *
 * Deliberately says nothing about *why* it is unhealthy. This endpoint is
 * reachable from the internet and a connection string in an error body is a
 * gift to whoever is scanning.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json(
      { status: "ok", time: new Date().toISOString() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "degraded" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
