import { afterEach, expect, test, vi } from "vitest";
import { db } from "@/lib/db";
import type { Mail } from "@/server/mailer";
import { withCleanDb } from "@/test/db";

// Sign-up confirms the address with a six-digit code typed on the site, not a
// link: a link opened on a phone confirmed nothing on the laptop that signed
// up, and mail scanners that "click" links could confirm an address nobody
// had opened.
const sent: Mail[] = [];
vi.mock("@/server/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/mailer")>()),
  sendMail: async (mail: Mail) => {
    sent.push(mail);
  },
}));

afterEach(() => {
  sent.length = 0;
});

async function signUp(email: string) {
  const { auth } = await import("@/lib/auth");
  await auth.api.signUpEmail({
    body: { email, password: "a-long-enough-test-password", name: "Code Test" },
  });
  return auth;
}

test(
  "signing up mails a six-digit code and no link",
  withCleanDb(async () => {
    await signUp("code@example.test");

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("code@example.test");
    expect(sent[0]?.code).toMatch(/^\d{6}$/);
    expect(sent[0]?.link).toBeUndefined();
  }),
);

test(
  "the right code confirms the address and records when",
  withCleanDb(async () => {
    const auth = await signUp("right@example.test");
    const otp = sent[0]?.code ?? "";

    await auth.api.verifyEmailOTP({
      body: { email: "right@example.test", otp },
    });

    const row = await db.user.findUniqueOrThrow({
      where: { email: "right@example.test" },
      select: { emailVerified: true, emailVerifiedAt: true },
    });
    expect(row.emailVerified).toBe(true);
    expect(row.emailVerifiedAt).toBeInstanceOf(Date);
  }),
);

test(
  "a wrong code confirms nothing",
  withCleanDb(async () => {
    const auth = await signUp("wrong@example.test");
    const otp = sent[0]?.code === "000000" ? "111111" : "000000";

    await expect(
      auth.api.verifyEmailOTP({ body: { email: "wrong@example.test", otp } }),
    ).rejects.toThrow();

    const row = await db.user.findUniqueOrThrow({
      where: { email: "wrong@example.test" },
      select: { emailVerified: true },
    });
    expect(row.emailVerified).toBe(false);
  }),
);

test(
  "asking for a new code sends one to an account that exists",
  withCleanDb(async () => {
    const auth = await signUp("again@example.test");
    sent.length = 0;

    await auth.api.sendVerificationOTP({
      body: { email: "again@example.test", type: "email-verification" },
    });
    await auth.api.sendVerificationOTP({
      body: { email: "nobody@example.test", type: "email-verification" },
    });

    expect(sent.map((m) => m.to)).toEqual(["again@example.test"]);
  }),
);

test(
  "codes only confirm an address: signing in or resetting a password with one is switched off",
  withCleanDb(async () => {
    // The plugin also offers passwordless sign-in and password reset by
    // code. Sign-in by code would walk round both the password and
    // two-factor, so those routes are not served at all.
    const { auth } = await import("@/lib/auth");
    for (const path of [
      "/sign-in/email-otp",
      "/email-otp/request-password-reset",
      "/email-otp/reset-password",
      "/forget-password/email-otp",
      "/email-otp/request-email-change",
      "/email-otp/change-email",
    ]) {
      const response = await auth.handler(
        new Request(`http://localhost:3000/api/auth${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:3000",
          },
          body: JSON.stringify({ email: "x@example.test", otp: "123456" }),
        }),
      );
      expect(response.status, path).toBe(404);
    }
  }),
);
