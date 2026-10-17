import { afterEach, expect, test, vi } from "vitest";
import { db } from "@/lib/db";
import { withCleanDb } from "@/test/db";

// A fresh production deploy has no mail server until the owner adds one, and
// any deploy loses it while the provider is down. sendMail throws in that
// state on purpose; what matters is that a sign-up survives it.
afterEach(() => {
  vi.unstubAllEnvs();
});

test(
  "signing up in production with no mail server still creates the account",
  withCleanDb(async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMTP_HOST", "");
    const { auth } = await import("@/lib/auth");
    // Better Auth logs the failed verification email rather than failing
    // the request; keep that out of the test output.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await auth.api.signUpEmail({
      body: {
        email: "no-mail-yet@example.test",
        password: "a-long-enough-test-password",
        name: "No Mail Yet",
      },
    });
    logged.mockRestore();

    expect(result.user.email).toBe("no-mail-yet@example.test");
    const row = await db.user.findUnique({
      where: { email: "no-mail-yet@example.test" },
      select: { emailVerified: true },
    });
    expect(row).toEqual({ emailVerified: false });
  }),
);
