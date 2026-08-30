/**
 * Creates the first superadmin on a fresh production database.
 *
 * Without this the only account with staff access comes from `prisma/seed.ts`,
 * which also inserts twenty demo users and fifteen hundred fake listings, all
 * sharing one published development password. That seed must never touch a
 * live database, so a real deployment needs its own way in — this is it.
 *
 *   ADMIN_EMAIL=you@channeladda.com ADMIN_NAME="Your Name" \
 *   ADMIN_PASSWORD='...' pnpm tsx --conditions=react-server scripts/create-admin.ts
 *
 * Safe to run twice: an existing account is promoted rather than duplicated,
 * and its password is left alone.
 */
import "dotenv/config";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/lib/db";

const MIN_PASSWORD = 12;

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_NAME?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !email.includes("@")) {
    throw new Error("ADMIN_EMAIL must be a real email address.");
  }
  if (!name) throw new Error("ADMIN_NAME is required.");
  if (!password || password.length < MIN_PASSWORD) {
    throw new Error(
      `ADMIN_PASSWORD must be at least ${MIN_PASSWORD} characters. This account can change fees and appoint staff.`,
    );
  }

  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });

  if (existing) {
    if (existing.role === "SUPERADMIN") {
      console.log(`${email} is already a superadmin. Nothing to do.`);
      process.exit(0);
    }
    await db.user.update({
      where: { id: existing.id },
      data: { role: "SUPERADMIN" },
    });
    console.log(`Promoted ${email} from ${existing.role} to SUPERADMIN.`);
    process.exit(0);
  }

  const user = await db.user.create({
    data: {
      email,
      name,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      role: "SUPERADMIN",
    },
    select: { id: true },
  });

  // Better Auth keeps the password on Account, never on User. providerId
  // "credential" is its name for password login, and it looks the row up by
  // (issuer, accountId) -- which the seed sets to the user id, so this matches.
  await db.account.create({
    data: {
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      issuer: "local:credential",
      password: await hashPassword(password),
      updatedAt: new Date(),
    },
  });

  console.log(`Created superadmin ${email}.`);
  console.log("Sign in at /signin, then set fees under /admin/settings.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
