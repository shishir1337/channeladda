import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * The Prisma client for the whole app.
 *
 * Cached on globalThis so Next's dev hot-reload does not open a new pool on
 * every edit — but reachable through a proxy rather than a fixed binding, so
 * a dead client can be thrown away and rebuilt without restarting the server.
 * Without that, a database restart left every request failing forever against
 * a pool of broken sockets.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  dbReachable?: { at: number; ok: boolean };
};

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Run `pnpm db:up` and check your .env file.",
    );
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

let client: PrismaClient | undefined = globalForPrisma.prisma;

function currentClient(): PrismaClient {
  if (!client) {
    client = createClient();
    if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  }
  return client;
}

/** Drops the cached client so the next access builds a fresh pool. */
async function resetClient() {
  const dead = client;
  client = undefined;
  globalForPrisma.prisma = undefined;
  globalForPrisma.dbReachable = undefined;
  await dead?.$disconnect().catch(() => {});
}

/**
 * Property access resolves against whichever client is current, so callers
 * keep a stable `db` import across reconnects.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const active = currentClient();
    const value = Reflect.get(active as object, prop, active);
    return typeof value === "function" ? value.bind(active) : value;
  },
}) as PrismaClient;

/**
 * Cheap connectivity probe used by the development-only setup screen.
 *
 * This has to run on the server: Next sanitises errors thrown inside Server
 * Components before they reach `error.tsx`, so the client boundary never sees
 * the underlying "ECONNREFUSED" and cannot tell a dead database apart from any
 * other failure.
 *
 * A failure also discards the client, so bringing the database back up is
 * picked up on the next request instead of needing a server restart. Successes
 * are cached briefly so a page running a dozen queries does not probe a dozen
 * times.
 */
export async function isDatabaseReachable(): Promise<boolean> {
  const cached = globalForPrisma.dbReachable;
  if (cached?.ok && Date.now() - cached.at < 2_000) return true;

  try {
    await currentClient().$queryRaw`SELECT 1`;
    globalForPrisma.dbReachable = { at: Date.now(), ok: true };
    return true;
  } catch {
    // Never cache a failure: the very next request may be the one that works.
    await resetClient();
    return false;
  }
}
