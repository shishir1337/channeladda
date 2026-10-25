import { expect, test } from "vitest";
import {
  maskEmail,
  parseNewEmail,
  parsePasswordChange,
} from "@/lib/account-security";

test("a new password must be long enough, new, and typed the same twice", () => {
  expect(
    parsePasswordChange({ current: "", next: "short", confirm: "short" }),
  ).toEqual({
    ok: false,
    errors: {
      current: "Enter your current password.",
      next: "Use at least 10 characters.",
    },
  });

  expect(
    parsePasswordChange({
      current: "the-old-password",
      next: "the-old-password",
      confirm: "the-old-password",
    }),
  ).toEqual({
    ok: false,
    errors: { next: "That's your current password. Choose a new one." },
  });

  expect(
    parsePasswordChange({
      current: "the-old-password",
      next: "a-brand-new-password",
      confirm: "a-brand-new-passwor",
    }),
  ).toEqual({
    ok: false,
    errors: {
      confirm: "The two new passwords don't match. Type it again.",
    },
  });

  expect(
    parsePasswordChange({
      current: "the-old-password",
      next: "x".repeat(129),
      confirm: "x".repeat(129),
    }),
  ).toMatchObject({ ok: false, errors: { next: expect.any(String) } });

  expect(
    parsePasswordChange({
      current: "the-old-password",
      next: "a-brand-new-password",
      confirm: "a-brand-new-password",
    }),
  ).toEqual({ ok: true });
});

test("a new email is trimmed, lower-cased, and must differ from the current one", () => {
  expect(parseNewEmail("  Nadia@Example.COM ", "old@example.com")).toEqual({
    ok: true,
    email: "nadia@example.com",
  });
  expect(parseNewEmail("OLD@example.com", "old@example.com")).toEqual({
    ok: false,
    error: "That's already your email.",
  });
  expect(parseNewEmail("", "old@example.com")).toMatchObject({ ok: false });
  expect(parseNewEmail("not an email", "old@example.com")).toMatchObject({
    ok: false,
  });
});

test("a masked address keeps the first letter and the domain", () => {
  expect(maskEmail("nadia.rahman@gmail.com")).toBe("n***@gmail.com");
  expect(maskEmail("a@x.io")).toBe("a***@x.io");
  expect(maskEmail("broken")).toBe("***");
});
