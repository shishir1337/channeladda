/**
 * Postgres 40001 — "could not serialize access due to read/write
 * dependencies" — which a Serializable transaction raises when it loses a
 * race.
 *
 * Shared, because two modules needed it and the second one got it wrong. Three
 * shapes, depending on which layer catches it: Prisma's own `P2034`, the raw
 * SQLSTATE, and — with the pg driver adapter, which is what this project
 * uses — a `DriverAdapterError` whose **cause** carries
 * `kind: "TransactionWriteConflict"` and `originalCode: "40001"`.
 *
 * That last one is the one that actually arrives here, and it is invisible to
 * the obvious tests for it: `JSON.stringify(error)` never reaches it, because
 * a cause installed through `new Error(msg, { cause })` is non-enumerable.
 * Missing it turns a lost race — an ordinary, expected event — into a 500 for
 * somebody who should simply have been told the balance was short.
 *
 * It cost a test that passed alone and failed in a full suite run to find.
 */
export function isSerializationFailure(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 5; depth++) {
    if (typeof current !== "object") break;
    const it = current as {
      code?: string;
      originalCode?: string;
      kind?: string;
      cause?: unknown;
    };
    if (
      it.code === "P2034" ||
      it.code === "40001" ||
      it.originalCode === "40001" ||
      it.kind === "TransactionWriteConflict"
    ) {
      return true;
    }
    current = it.cause;
  }
  return false;
}
