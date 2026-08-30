import "dotenv/config";
import { db, isDatabaseReachable } from "@/lib/db";

async function main() {
  console.log(
    "DATABASE_URL:",
    process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@"),
  );
  try {
    const r = await db.$queryRaw`SELECT 1 as ok`;
    console.log("raw query   : OK", JSON.stringify(r));
  } catch (e) {
    console.log("raw query   : FAILED");
    console.log("  name   :", (e as Error).name);
    console.log(
      "  message:",
      String((e as Error).message)
        .split("\n")
        .slice(0, 4)
        .join(" / "),
    );
  }
  console.log("isDatabaseReachable:", await isDatabaseReachable());
  const n = await db.listing.count().catch((e) => `ERR ${(e as Error).name}`);
  console.log("listing.count      :", n);
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
