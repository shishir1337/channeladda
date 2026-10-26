/**
 * Empties the site for launch: every buyer and seller and everything done
 * on the site goes, staff accounts and how they sign in stay, settings go
 * back to their defaults, and every uploaded file is deleted. See
 * `server/data-reset.ts` for exactly what is kept.
 *
 * On the server, with the site stopped and a backup taken:
 *
 *   pnpm data:reset                         shows what would go; changes nothing
 *   pnpm data:reset --confirm=<database>    does it
 *
 * The database's name has to be typed, so it cannot be run against the
 * wrong one by accident. There is no undo but the backup.
 */
import "./load-env";

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "@/lib/db";
import { mediaFolder } from "@/lib/media";
import { deleteUploadedFiles, planReset, resetData } from "@/server/data-reset";
import { onImageKit } from "@/server/imagekit";

/** Where the database is, without its password. */
function target(): { host: string; name: string } {
  const url = new URL(process.env.DATABASE_URL ?? "");
  return { host: url.host, name: url.pathname.replace(/^\//, "") };
}

async function main() {
  const { host, name } = target();
  const confirm = process.argv
    .find((arg) => arg.startsWith("--confirm="))
    ?.slice("--confirm=".length);

  const plan = await planReset();
  console.log(`Database: ${name} on ${host}`);
  console.log(`\nBuyer and seller accounts to delete: ${plan.membersDeleted}`);
  console.log(
    `Staff accounts to keep: ${plan.staffKept.map((s) => `${s.count} ${s.role}`).join(", ") || "none"}`,
  );
  if (!plan.staffKept.some((s) => s.role === "SUPERADMIN")) {
    console.log(
      "  No SUPERADMIN would be left. Create one afterwards: pnpm create:admin",
    );
  }
  console.log("\nTables to empty (rows now):");
  for (const t of plan.wiped.filter((t) => t.rows > 0)) {
    console.log(`  ${t.table}: ${t.rows}`);
  }
  console.log("\nUploaded files to delete:");
  const disk = resolve(process.cwd(), ".data", "uploads");
  console.log(`  On this server: ${existsSync(disk) ? disk : "none"}`);
  console.log(
    `  On ImageKit: ${onImageKit() ? `the /${mediaFolder()} folder` : "not set up"}`,
  );

  if (confirm === undefined) {
    console.log(
      `\nNothing was changed. To do it: pnpm data:reset --confirm=${name}`,
    );
    return;
  }
  if (confirm !== name) {
    console.log(
      `\n--confirm=${confirm} is not this database's name (${name}). Nothing was changed.`,
    );
    process.exitCode = 1;
    return;
  }

  await resetData();
  console.log(
    "\nDatabase emptied. Staff accounts kept; settings back to defaults.",
  );
  const files = await deleteUploadedFiles();
  console.log(
    `Uploaded files deleted from this server${files.imagekit ? " and from ImageKit" : ""}.`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
