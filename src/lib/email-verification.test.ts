import { afterEach, expect, test, vi } from "vitest";
import {
  emailVerificationRequired,
  needsEmailVerification,
} from "@/lib/email-verification";

afterEach(() => {
  vi.unstubAllEnvs();
});

test("a confirmed email is needed unless it is switched off", () => {
  // The owner, 2026-10-26: "turn it on".
  vi.stubEnv("NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION", "");
  expect(emailVerificationRequired()).toBe(true);
  vi.stubEnv("NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION", "true");
  expect(emailVerificationRequired()).toBe(true);
  vi.stubEnv("NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION", "false");
  expect(emailVerificationRequired()).toBe(false);
});

test("only an unconfirmed address is stopped", () => {
  vi.stubEnv("NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION", "");
  expect(needsEmailVerification({ emailVerified: false })).toBe(true);
  expect(needsEmailVerification({ emailVerified: true })).toBe(false);
  vi.stubEnv("NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION", "false");
  expect(needsEmailVerification({ emailVerified: false })).toBe(false);
});
