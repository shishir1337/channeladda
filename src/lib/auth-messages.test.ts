import { expect, test } from "vitest";
import { authErrorMessage, TOO_MANY_ATTEMPTS } from "@/lib/auth-messages";

test("a rate limit says to wait, not to try again at once", () => {
  // Better Auth's limiter answers 429 with a message and no code, so QA saw
  // "Could not create the account. Try again." — the one thing not to do.
  expect(
    authErrorMessage(
      { status: 429, message: "Too many requests. Please try again later." },
      "Could not create the account. Try again.",
    ),
  ).toBe(TOO_MANY_ATTEMPTS);
  expect(TOO_MANY_ATTEMPTS).toBe(
    "Too many attempts. Wait a minute and try again.",
  );
});

test("known codes keep their own words", () => {
  expect(
    authErrorMessage(
      { status: 401, code: "INVALID_EMAIL_OR_PASSWORD" },
      "Could not sign you in. Try again.",
    ),
  ).toBe("That email and password do not match an account.");
  expect(
    authErrorMessage(
      { status: 422, code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" },
      "x",
    ),
  ).toMatch(/already exists/);
});

test("anything else falls back to the form's own line", () => {
  expect(
    authErrorMessage({ status: 500 }, "Could not sign you in. Try again."),
  ).toBe("Could not sign you in. Try again.");
});
