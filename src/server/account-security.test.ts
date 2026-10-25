import { randomUUID } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { EMAIL_UNAVAILABLE } from "@/lib/account-security";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  changePassword,
  confirmEmailChange,
  RECENT_SIGN_IN_MS,
  requestEmailChange,
} from "@/server/account-security";
import type { Mail } from "@/server/mailer";
import { seedUser, withCleanDb } from "@/test/db";

// The owner: a signed-in member could not change their email or their
// password at all. These run the real Better Auth against the test
// database; only the mail is caught instead of sent.
const sent: Mail[] = [];
vi.mock("@/server/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/mailer")>()),
  sendMail: async (mail: Mail) => {
    sent.push(mail);
  },
}));

afterEach(() => {
  sent.length = 0;
  vi.unstubAllEnvs();
});

const PASSWORD = "the-first-long-password";

/** The request headers a signed-in browser would send. */
function cookieHeaders(response: Headers): Headers {
  const cookie = response
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
  return new Headers({ cookie });
}

async function signUp(email = `member-${randomUUID()}@example.test`) {
  const { headers } = await auth.api.signUpEmail({
    body: { email, password: PASSWORD, name: "Nadia Rahman" },
    returnHeaders: true,
  });
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  sent.length = 0;
  return { user, email, headers: cookieHeaders(headers) };
}

async function signIn(email: string, password = PASSWORD) {
  const { headers } = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });
  return cookieHeaders(headers);
}

async function canSignIn(email: string, password: string) {
  try {
    await auth.api.signInEmail({ body: { email, password } });
    return true;
  } catch {
    return false;
  }
}

/** A Google-only member: the session stays, the password account goes. */
async function makeGoogleOnly(userId: string) {
  await db.account.updateMany({
    where: { userId, providerId: "credential" },
    data: { providerId: "google", accountId: randomUUID(), password: null },
  });
}

// ------------------------------------------------------------- password

test(
  "a wrong current password is refused, and the password stays as it was",
  withCleanDb(async () => {
    const { email, headers } = await signUp();

    const result = await changePassword(headers, {
      current: "not-the-password",
      next: "a-brand-new-password",
      confirm: "a-brand-new-password",
    });

    expect(result).toEqual({
      ok: false,
      errors: {
        current: "That isn't your current password. Check it and try again.",
      },
    });
    expect(await canSignIn(email, PASSWORD)).toBe(true);
    expect(await canSignIn(email, "a-brand-new-password")).toBe(false);
    expect(sent).toEqual([]);
    expect(
      await db.notification.count({
        where: { user: { email: email.toLowerCase() } },
      }),
    ).toBe(0);
  }),
);

test(
  "changing the password signs out every other device and tells the account's email",
  withCleanDb(async () => {
    const { user, email, headers } = await signUp();
    const phone = await signIn(email);
    const before = await db.session.findMany({
      where: { userId: user.id },
      select: { token: true },
    });
    expect(before).toHaveLength(2);

    const result = await changePassword(headers, {
      current: PASSWORD,
      next: "a-brand-new-password",
      confirm: "a-brand-new-password",
    });
    expect(result).toEqual({
      ok: true,
      message:
        "Password changed. You've been signed out on your other devices.",
    });

    // Both old sessions are gone; this browser was handed a fresh one.
    const after = await db.session.findMany({
      where: { userId: user.id },
      select: { token: true },
    });
    expect(after).toHaveLength(1);
    expect(before.map((s) => s.token)).not.toContain(after[0]?.token);
    // The phone's own signed cookie can still vouch for it until the
    // session cache runs out (a minute, `session.cookieCache` in the auth
    // config); the first read past that finds no session at all.
    expect(
      await auth.api.getSession({
        headers: phone,
        query: { disableCookieCache: true },
      }),
    ).toBeNull();

    expect(await canSignIn(email, "a-brand-new-password")).toBe(true);
    expect(await canSignIn(email, PASSWORD)).toBe(false);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: email,
      subject: "Your Channel Adda password was changed",
      action: "Contact support",
    });
    expect(sent[0]?.body).toContain("If it wasn't you, contact support");
    expect(sent[0]?.link).toMatch(/\/support\?topic=/);

    const audit = await db.auditLog.findFirst({
      where: { action: "user.password_changed", entityId: user.id },
    });
    expect(audit?.actorId).toBe(user.id);

    // And in the bell, where it is seen when no mail is set up (QA: none
    // of these changes left a trace).
    expect(
      await db.notification.findMany({
        where: { userId: user.id },
        select: { title: true, body: true, href: true },
      }),
    ).toEqual([
      {
        title: "Your password was changed",
        body: expect.stringContaining("If this wasn't you, contact support"),
        href: "/dashboard/security",
      },
    ]);
  }),
);

test(
  "five wrong passwords pause further tries, even with the right one",
  withCleanDb(async () => {
    const { email, headers } = await signUp();
    const wrong = {
      current: "not-the-password",
      next: "a-brand-new-password",
      confirm: "a-brand-new-password",
    };

    for (let i = 0; i < 4; i++) {
      expect(await changePassword(headers, wrong)).toMatchObject({
        ok: false,
        errors: { current: expect.any(String) },
      });
    }
    const fifth = await changePassword(headers, wrong);
    expect(fifth).toMatchObject({
      ok: false,
      errors: { form: expect.stringContaining("Too many wrong passwords") },
    });

    // The email form shares the count: it checks the same password.
    expect(
      await requestEmailChange(headers, {
        email: "somewhere-else@example.test",
        password: PASSWORD,
      }),
    ).toMatchObject({
      ok: false,
      errors: { form: expect.stringContaining("Too many wrong passwords") },
    });

    const right = await changePassword(headers, {
      ...wrong,
      current: PASSWORD,
    });
    expect(right).toMatchObject({
      ok: false,
      errors: { form: expect.stringContaining("Too many wrong passwords") },
    });
    expect(await canSignIn(email, PASSWORD)).toBe(true);
  }),
);

// ---------------------------------------------------------------- email

test(
  "an email already in use is refused without saying whose it is",
  withCleanDb(async () => {
    const { user, email, headers } = await signUp();
    const other = await seedUser();

    for (const taken of [other.email, other.email.toUpperCase()]) {
      expect(
        await requestEmailChange(headers, { email: taken, password: PASSWORD }),
      ).toEqual({ ok: false, errors: { email: EMAIL_UNAVAILABLE } });
    }

    expect(
      (await db.user.findUniqueOrThrow({ where: { id: user.id } })).email,
    ).toBe(email);
    expect(sent).toEqual([]);
  }),
);

test(
  "the same email as now is refused, however it is typed",
  withCleanDb(async () => {
    const { email, headers } = await signUp();

    expect(
      await requestEmailChange(headers, {
        email: ` ${email.toUpperCase()} `,
        password: PASSWORD,
      }),
    ).toEqual({ ok: false, errors: { email: "That's already your email." } });
  }),
);

test(
  "a wrong password is refused before the new address is looked at",
  withCleanDb(async () => {
    const { headers } = await signUp();
    const other = await seedUser();

    expect(
      await requestEmailChange(headers, {
        email: other.email,
        password: "not-the-password",
      }),
    ).toEqual({
      ok: false,
      errors: {
        password: "That isn't your current password. Check it and try again.",
      },
    });
    expect(
      await requestEmailChange(headers, { email: other.email, password: "" }),
    ).toEqual({
      ok: false,
      errors: { password: "Enter your current password." },
    });
  }),
);

test(
  "with confirmation off, the email changes at once, the rest of the account stays, and the old address is told",
  withCleanDb(async () => {
    vi.stubEnv("NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION", "");
    const { user, email, headers } = await signUp();
    await db.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifiedAt: new Date() },
    });
    const newEmail = `nadia.new-${randomUUID()}@example.test`;

    const result = await requestEmailChange(headers, {
      email: newEmail.toUpperCase(),
      password: PASSWORD,
    });
    expect(result).toEqual({
      ok: true,
      step: "done",
      email: newEmail,
      message: `Your email is now ${newEmail}.`,
    });

    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({
      email: newEmail,
      // Nothing has proved the new inbox yet.
      emailVerified: false,
      emailVerifiedAt: null,
      name: user.name,
      role: user.role,
      slug: user.slug,
      createdAt: user.createdAt,
    });
    expect(await db.account.count({ where: { userId: user.id } })).toBe(1);

    // Signs in with the new address and the same password.
    expect(await canSignIn(newEmail, PASSWORD)).toBe(true);
    expect(await canSignIn(email, PASSWORD)).toBe(false);
    // And the session that made the change still works.
    expect((await auth.api.getSession({ headers }))?.user.id).toBe(user.id);

    // One notice, to the address that might have been taken over.
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: email,
      subject: "Your Channel Adda email was changed",
    });
    expect(sent[0]?.body).toContain("n***@example.test");
    expect(sent[0]?.body).not.toContain(newEmail);

    const audit = await db.auditLog.findFirst({
      where: { action: "user.email_changed", entityId: user.id },
    });
    expect(audit).toMatchObject({
      actorId: user.id,
      before: { email },
      after: { email: newEmail, confirmed: false },
    });

    // In the bell as well, with the new address masked as in the mail.
    const notices = await db.notification.findMany({
      where: { userId: user.id },
      select: { title: true, body: true },
    });
    expect(notices).toEqual([
      {
        title: "Your email was changed to n***@example.test",
        body: expect.stringContaining("If this wasn't you, contact support"),
      },
    ]);
  }),
);

test(
  "with confirmation on, a code goes to the new address and the email changes only once it is typed",
  withCleanDb(async () => {
    vi.stubEnv("NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION", "true");
    const { user, email, headers } = await signUp();
    const newEmail = `nadia.new-${randomUUID()}@example.test`;

    const asked = await requestEmailChange(headers, {
      email: newEmail,
      password: PASSWORD,
    });
    expect(asked).toEqual({
      ok: true,
      step: "code",
      email: newEmail,
      message: `We sent a 6-digit code to ${newEmail}.`,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(newEmail);
    const code = sent[0]?.code ?? "";
    expect(code).toMatch(/^\d{6}$/);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: user.id } })).email,
    ).toBe(email);

    const wrongCode = code === "000000" ? "111111" : "000000";
    expect(
      await confirmEmailChange(headers, { email: newEmail, code: wrongCode }),
    ).toEqual({
      ok: false,
      errors: {
        code: "That code isn't right. Check the email and try again.",
      },
    });

    sent.length = 0;
    expect(
      await confirmEmailChange(headers, { email: newEmail, code }),
    ).toMatchObject({ ok: true, step: "done", email: newEmail });

    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.email).toBe(newEmail);
    expect(row.emailVerified).toBe(true);
    expect(row.emailVerifiedAt).toBeInstanceOf(Date);

    expect(sent.map((mail) => mail.to)).toEqual([email]);
    expect(sent[0]?.subject).toBe("Your Channel Adda email was changed");
  }),
);

test(
  "with confirmation on, a used address gets no code",
  withCleanDb(async () => {
    vi.stubEnv("NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION", "true");
    const { headers } = await signUp();
    const other = await seedUser();

    expect(
      await requestEmailChange(headers, {
        email: other.email,
        password: PASSWORD,
      }),
    ).toEqual({ ok: false, errors: { email: EMAIL_UNAVAILABLE } });
    expect(sent).toEqual([]);
  }),
);

// ---------------------------------------------------------- Google only

test(
  "a Google-only member has no password to change, and needs a recent sign-in to change their email",
  withCleanDb(async () => {
    const { user, email, headers } = await signUp();
    await makeGoogleOnly(user.id);

    expect(
      await changePassword(headers, {
        current: PASSWORD,
        next: "a-brand-new-password",
        confirm: "a-brand-new-password",
      }),
    ).toEqual({
      ok: false,
      errors: {
        form: "You sign in with Google, so there's no password to change.",
      },
    });

    // Signed in an hour ago: Google has to be asked again first.
    await db.session.updateMany({
      where: { userId: user.id },
      data: { createdAt: new Date(Date.now() - RECENT_SIGN_IN_MS - 60_000) },
    });
    const newEmail = `nadia.new-${randomUUID()}@example.test`;
    expect(
      await requestEmailChange(headers, { email: newEmail, password: "" }),
    ).toMatchObject({
      ok: false,
      reauth: true,
      errors: { form: expect.any(String) },
    });
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: user.id } })).email,
    ).toBe(email);

    // Just signed in: no password to ask for, and the change goes through.
    await db.session.updateMany({
      where: { userId: user.id },
      data: { createdAt: new Date() },
    });
    expect(
      await requestEmailChange(headers, { email: newEmail, password: "" }),
    ).toMatchObject({ ok: true, step: "done", email: newEmail });
    expect(sent.map((mail) => mail.to)).toEqual([email]);
  }),
);

test(
  "a Google-only member adds a password through the emailed link, which signs every device out",
  withCleanDb(async () => {
    const { user, email } = await signUp();
    await makeGoogleOnly(user.id);

    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: email,
      subject: "Set a password for Channel Adda",
      action: "Set a password",
    });
    const token = sent[0]?.link?.match(/\/reset-password\/([^?]+)/)?.[1];
    expect(token).toBeTruthy();

    await auth.api.resetPassword({
      body: { newPassword: "a-password-at-last", token: token ?? "" },
    });

    // The reset screen says every other session was signed out; now it is.
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await canSignIn(email, "a-password-at-last")).toBe(true);
  }),
);

test(
  "a member with a password still gets the ordinary reset email",
  withCleanDb(async () => {
    const { email } = await signUp();
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
    });
    expect(sent[0]).toMatchObject({
      to: email,
      subject: "Reset your Channel Adda password",
      action: "Reset password",
    });
  }),
);

// ------------------------------------------------------------ the routes

test(
  "the password and email routes are not served over HTTP, so nothing skips these checks",
  withCleanDb(async () => {
    const { headers } = await signUp();
    for (const [path, body] of [
      [
        "/change-password",
        { currentPassword: PASSWORD, newPassword: "a-brand-new-password" },
      ],
      ["/change-email", { newEmail: "elsewhere@example.test" }],
    ] as const) {
      const response = await auth.handler(
        new Request(`http://localhost:3000/api/auth${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:3000",
            cookie: headers.get("cookie") ?? "",
          },
          body: JSON.stringify(body),
        }),
      );
      expect(response.status, path).toBe(404);
    }
  }),
);
