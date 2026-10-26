import "server-only";

import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "@/lib/db";
import { deleteFolderFromImageKit, onImageKit } from "@/server/imagekit";
import { clearSettingsCache } from "@/server/settings";

/**
 * Empties the site for launch: every member, and everything anybody did.
 *
 * The owner, 2026-10-26, after weeks of test deals on the live site: "I
 * want to remove all data from production". What stays is the staff —
 * their accounts, their passwords and Google links, their two-step setup
 * and an agent's transfer identities — so the team signs straight back in.
 * Settings go back to their defaults. Everything else, every table but
 * those three, is emptied, so a table added later is emptied too.
 *
 * Run from `scripts/reset-data.ts`, which shows the plan first and needs
 * the database's name typed before it does anything.
 */

/** The staff's accounts, how they sign in, and the migrations' own record. */
const KEPT = new Set(["User", "Account", "TwoFactor", "_prisma_migrations"]);

export type ResetPlan = {
  /** Every table that is emptied, with how many rows it has now. */
  wiped: { table: string; rows: number }[];
  /** Buyers and sellers: every account that is not staff. */
  membersDeleted: number;
  staffKept: { role: string; count: number }[];
};

async function tables(): Promise<string[]> {
  const rows = await db.$queryRaw<{ name: string }[]>`
    SELECT tablename AS name FROM pg_tables
    WHERE schemaname = current_schema() ORDER BY tablename`;
  return rows.map((row) => row.name).filter((name) => !KEPT.has(name));
}

function quoted(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** What a reset would do, changing nothing. */
export async function planReset(): Promise<ResetPlan> {
  const wiped: ResetPlan["wiped"] = [];
  for (const table of await tables()) {
    const [{ rows }] = await db.$queryRawUnsafe<{ rows: bigint }[]>(
      `SELECT count(*) AS rows FROM ${quoted(table)}`,
    );
    wiped.push({ table, rows: Number(rows) });
  }
  const membersDeleted = await db.user.count({ where: { role: "USER" } });
  const staff = await db.user.groupBy({
    by: ["role"],
    where: { role: { not: "USER" } },
    _count: { _all: true },
  });
  return {
    wiped,
    membersDeleted,
    staffKept: staff.map((row) => ({ role: row.role, count: row._count._all })),
  };
}

/**
 * Refuses to start if a kept table points at one that is emptied: TRUNCATE
 * ... CASCADE would empty the kept one with it. None does today; this is
 * for the day a column is added to User that would.
 */
async function assertKeptTablesStandAlone(wiped: string[]): Promise<void> {
  const links = await db.$queryRaw<{ from: string; to: string }[]>`
    SELECT conrelid::regclass::text AS "from", confrelid::regclass::text AS "to"
    FROM pg_constraint WHERE contype = 'f'`;
  const bare = (name: string) => name.replace(/^.*\./, "").replace(/"/g, "");
  const emptied = new Set(wiped);
  for (const link of links) {
    if (KEPT.has(bare(link.from)) && emptied.has(bare(link.to))) {
      throw new Error(
        `${bare(link.from)} points at ${bare(link.to)}, which a reset empties. Nothing was changed.`,
      );
    }
  }
}

/** Empties the database as `planReset` describes, in one transaction. */
export async function resetData(): Promise<ResetPlan> {
  const plan = await planReset();
  const wiped = plan.wiped.map((t) => t.table);
  await assertKeptTablesStandAlone(wiped);

  await db.$transaction([
    db.$executeRawUnsafe(
      `TRUNCATE TABLE ${wiped.map(quoted).join(", ")} RESTART IDENTITY CASCADE`,
    ),
    // Their sign-in rows go with them; staff keep theirs.
    db.account.deleteMany({ where: { user: { role: "USER" } } }),
    db.twoFactor.deleteMany({ where: { user: { role: "USER" } } }),
    db.user.deleteMany({ where: { role: "USER" } }),
    // A staff member's ID check went with the rest, and so did the uploads:
    // a photo that was one would be a broken picture. A Google photo is
    // not an upload, and stays.
    db.$executeRawUnsafe(
      `UPDATE "User" SET "kycStatus" = 'NOT_STARTED', "kycDocHash" = NULL, "responseMins" = NULL,
       "image" = CASE WHEN "image" LIKE '/uploads/%' THEN NULL ELSE "image" END`,
    ),
  ]);
  clearSettingsCache();
  return plan;
}

/**
 * Deletes every uploaded file: the server's own folder of them, and the
 * site's folder on ImageKit when uploads live there. After a reset nothing
 * points at any of them.
 */
export async function deleteUploadedFiles(): Promise<{ imagekit: boolean }> {
  await rm(resolve(process.cwd(), ".data", "uploads"), {
    recursive: true,
    force: true,
  });
  if (!onImageKit()) return { imagekit: false };
  await deleteFolderFromImageKit();
  return { imagekit: true };
}
