/**
 * Removes listings and accounts left behind by the test suites.
 *
 * `offers.cjs` publishes a listing through the UI to test the reservation lock
 * and cannot delete it afterwards, so the live count drifts up by one on every
 * run and the count-based assertions in browse.cjs start failing. Run this
 * between full suite runs.
 */
import "dotenv/config";
import { db } from "@/lib/db";

async function main() {
  const listings = await db.listing.deleteMany({
    where: {
      OR: [
        { handle: { startsWith: "@offer" } },
        { handle: { startsWith: "@haggle" } },
        { handle: { startsWith: "@talk" } },
        { handle: { startsWith: "@susp" } },
      ],
    },
  });
  const users = await db.user.deleteMany({
    where: { email: { endsWith: "@channeladda.test" } },
  });
  console.log(`removed ${listings.count} listings, ${users.count} accounts`);
  console.log("LIVE:", await db.listing.count({ where: { status: "LIVE" } }));
  process.exit(0);
}
main();
