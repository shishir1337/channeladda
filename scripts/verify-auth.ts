/**
 * Exercises Better Auth against the real database without going through HTTP.
 *
 * Checks the three things that silently break an auth setup: that a new
 * sign-up writes the rows it should, that a seeded account can actually sign
 * in, and that privileged fields cannot be set from the request body.
 */
import "dotenv/config";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(
    `${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`,
  );
  if (!ok) failures++;
}

const TEST_EMAIL = `verify-${Date.now()}@example.com`;
const TEST_PASSWORD = "correct-horse-battery";

async function main() {
  console.log("\n— sign up —");
  const signUp = await auth.api.signUpEmail({
    body: { email: TEST_EMAIL, password: TEST_PASSWORD, name: "Verify Bot" },
  });
  check("sign-up returns a user", Boolean(signUp.user?.id));

  const created = await db.user.findUnique({
    where: { email: TEST_EMAIL },
    include: { accounts: true },
  });
  check("user row written", Boolean(created));
  check("role defaults to USER", created?.role === "USER", created?.role);
  check("email starts unverified", created?.emailVerified === false);
  check("exactly one credential account", created?.accounts.length === 1);

  const account = created?.accounts[0];
  console.log(
    `        issuer=${account?.issuer}  providerId=${account?.providerId}  accountId===userId:${account?.accountId === created?.id}`,
  );
  check("password stored on Account", Boolean(account?.password));
  check("no password column on User", !("passwordHash" in (created ?? {})));

  console.log("\n— privilege escalation —");
  const escalationEmail = `escalate-${Date.now()}@example.com`;
  await auth.api.signUpEmail({
    body: {
      email: escalationEmail,
      password: TEST_PASSWORD,
      name: "Escalation Bot",
      // Not part of the documented body — this is the attack.
      role: "SUPERADMIN",
      kycStatus: "APPROVED",
    } as never,
  });
  const escalated = await db.user.findUnique({
    where: { email: escalationEmail },
  });
  check(
    "role cannot be set at sign-up",
    escalated?.role === "USER",
    escalated?.role,
  );
  check(
    "kycStatus cannot be set at sign-up",
    escalated?.kycStatus === "NOT_STARTED",
    escalated?.kycStatus,
  );

  console.log("\n— sign in —");
  const fresh = await auth.api.signInEmail({
    body: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  check("new account can sign in", Boolean(fresh.user?.id));

  const seeded = await auth.api
    .signInEmail({
      body: {
        email: "admin@channeladda.com",
        password: "channeladda-dev-2026",
      },
    })
    .catch((e: unknown) => {
      console.log(`        seeded sign-in threw: ${(e as Error).message}`);
      return null;
    });
  check("seeded admin can sign in", Boolean(seeded?.user?.id));
  check(
    "seeded admin keeps SUPERADMIN",
    (seeded?.user as { role?: string } | undefined)?.role === "SUPERADMIN",
    (seeded?.user as { role?: string } | undefined)?.role,
  );

  console.log("\n— wrong password —");
  const bad = await auth.api
    .signInEmail({
      body: { email: "admin@channeladda.com", password: "wrong-password" },
    })
    .then(() => "accepted")
    .catch(() => "rejected");
  check("wrong password rejected", bad === "rejected");

  // Clean up the two throwaway users.
  await db.user.deleteMany({
    where: { email: { in: [TEST_EMAIL, escalationEmail] } },
  });

  console.log(
    `\n${failures === 0 ? "all checks passed" : `${failures} FAILED`}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
