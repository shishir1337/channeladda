import { afterEach, expect, test, vi } from "vitest";

// Production with no mail server: the state a fresh deploy is in until the
// owner adds SMTP, and the state any deploy is in while the provider is down.
afterEach(() => {
  vi.unstubAllEnvs();
});

async function productionWithoutMail() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SMTP_HOST", "");
  const { auth } = await import("@/lib/auth");
  return auth;
}

const user = {
  id: "u_1",
  email: "new.member@example.com",
  emailVerified: false,
  name: "New Member",
  createdAt: new Date(),
  updatedAt: new Date(),
};

test("a verification email that cannot be sent does not fail the sign-up", async () => {
  // The account has already been written by the time this runs. Throwing
  // here showed the visitor an error for an account that exists, and their
  // retry was refused as a duplicate email.
  const auth = await productionWithoutMail();
  const send = auth.options.emailVerification?.sendVerificationEmail;
  if (!send) throw new Error("verification email is not configured");

  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(
    send({ user, url: "https://example.com/verify", token: "t" }),
  ).resolves.toBeUndefined();
  // Not silently: the failure is logged where the owner will see it.
  expect(logged).toHaveBeenCalled();
  logged.mockRestore();
});

test("a password reset that cannot be sent still fails loudly", async () => {
  // Deliberately unchanged: a reset swallowed in silence leaves somebody
  // locked out with nobody aware of it.
  const auth = await productionWithoutMail();
  const send = auth.options.emailAndPassword?.sendResetPassword;
  if (!send) throw new Error("password reset is not configured");

  await expect(
    send({ user, url: "https://example.com/reset", token: "t" }),
  ).rejects.toThrow(/No email provider is configured/);
});
