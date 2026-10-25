/** What the forms say when Better Auth's rate limit answers. */
export const TOO_MANY_ATTEMPTS =
  "Too many attempts. Wait a minute and try again.";

/** MIN_PASSWORD_LENGTH in the auth config. */
const MIN_PASSWORD = 10;

/**
 * Turns a Better Auth failure into something worth reading.
 *
 * Sign-in deliberately never distinguishes "no such account" from "wrong
 * password" — that difference is how an attacker learns which addresses are
 * registered.
 *
 * The rate limit is a status, not a code: Better Auth's limiter answers 429
 * with only a message, so it fell through to "Try again" — the one thing
 * that makes it worse.
 */
export function authErrorMessage(
  error: { code?: string; status?: number; message?: string },
  fallback: string,
): string {
  if (error.status === 429) return TOO_MANY_ATTEMPTS;
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_PASSWORD":
    case "USER_NOT_FOUND":
      return "That email and password do not match an account.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "An account already exists for that email. Try signing in instead.";
    case "PASSWORD_TOO_SHORT":
      return `Use at least ${MIN_PASSWORD} characters.`;
    case "EMAIL_NOT_VERIFIED":
      return "Confirm your email address before signing in, with the code we emailed you.";
    case "INVALID_TOKEN":
    case "TOKEN_EXPIRED":
      return "That link has expired. Request a new one and try again.";
    default:
      return fallback;
  }
}
