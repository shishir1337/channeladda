/**
 * One-off: attach password credentials to the seeded demo users.
 *
 * The demo users were inserted before the `better_auth` migration, so they
 * have no Account row and therefore no way to sign in. Better Auth keeps the
 * password hash on Account (never on User), keyed by (issuer, accountId) with
 * accountId set to the user id — same shape `scripts/create-admin.ts` uses.
 *
 * Safe to re-run: the credential row is replaced, not duplicated.
 */
import "dotenv/config";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/lib/db";

const PASSWORD = "channeladda-dev-2026";

const TARGETS = [
  "admin@dealbaron.com",
  "moderator@dealbaron.com",
  "finance@dealbaron.com",
  "hannah-wells@example.com",
  "daniel-osei@example.com",
];

async function main() {
  const hash = await hashPassword(PASSWORD);

  for (const email of TARGETS) {
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, role: true, name: true },
    });

    if (!user) {
      console.log(`SKIP  ${email} — no such user`);
      continue;
    }

    await db.account.deleteMany({
      where: { userId: user.id, providerId: "credential" },
    });

    await db.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        issuer: "local:credential",
        password: hash,
        updatedAt: new Date(),
      },
    });

    // Unverified accounts can still sign in (requireEmailVerification is
    // false), but the banner nagging about it is noise in a dev database.
    await db.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifiedAt: new Date() },
    });

    console.log(`OK    ${user.role.padEnd(10)} ${email}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
