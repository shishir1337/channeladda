import { beforeEach, expect, test, vi } from "vitest";

const holder = globalThis as { prisma?: unknown; prismaBuild?: unknown };

beforeEach(() => {
  holder.prisma = undefined;
  holder.prismaBuild = undefined;
  vi.resetModules();
});

test("a client cached by an earlier build of the generated client is replaced", async () => {
  // `prisma generate` rewrites the client and the dev server hot-reloads it,
  // but globalThis survives the reload. The cached instance kept the old
  // schema, so a new column read as "Unknown field `paymentWindowHours`" on
  // every page that touched settings until somebody restarted the server.
  const stale = { $disconnect: vi.fn(async () => {}) };
  holder.prisma = stale;
  holder.prismaBuild = function OlderBuild() {};

  const { db } = await import("@/lib/db");

  await expect(db.platformSettings.count()).resolves.toBeTypeOf("number");
  expect(holder.prisma).not.toBe(stale);
  expect(stale.$disconnect).toHaveBeenCalled();
  await db.$disconnect();
});

test("a client cached by the code before builds were recorded is replaced", async () => {
  // A dev server already running when this landed holds a client with no
  // build recorded at all. That is the server that showed the error.
  const stale = { $disconnect: vi.fn(async () => {}) };
  holder.prisma = stale;

  const { db } = await import("@/lib/db");

  await expect(db.platformSettings.count()).resolves.toBeTypeOf("number");
  expect(stale.$disconnect).toHaveBeenCalled();
  await db.$disconnect();
});

test("a client cached by this same build is kept across a reload", async () => {
  // The reason it is cached at all: an ordinary edit must not open a new
  // pool, or drop the one in-flight requests are using.
  const { PrismaClient } = await import("@/generated/prisma/client");
  const current = { marker: "kept", $disconnect: vi.fn(async () => {}) };
  holder.prisma = current;
  holder.prismaBuild = PrismaClient;

  const { db } = await import("@/lib/db");

  expect((db as unknown as { marker: string }).marker).toBe("kept");
  expect(current.$disconnect).not.toHaveBeenCalled();
});
