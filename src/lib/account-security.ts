/**
 * The rules for changing your own password and email, shared by the forms
 * on the security page and the server that enforces them.
 *
 * Pure on purpose: the form shows the same message the server would give,
 * without a round trip, and the server never trusts that it did.
 */

/** The sign-up screen's "at least 10 characters". The auth config reads this too. */
export const MIN_PASSWORD_LENGTH = 10;

/** Better Auth's own ceiling; longer is refused before it is hashed. */
export const MAX_PASSWORD_LENGTH = 128;

/** The longest address the email standards allow. */
const MAX_EMAIL_LENGTH = 254;

/** The same loose check the sign-up form uses; the server adds a strict one. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type PasswordFields = { current: string; next: string; confirm: string };
export type PasswordErrors = Partial<
  Record<keyof PasswordFields | "form", string>
>;

export type EmailFields = { email: string; password: string };
export type EmailErrors = Partial<
  Record<keyof EmailFields | "code" | "form", string>
>;

/** What every refusal of a used address says, so it gives nothing away. */
export const EMAIL_UNAVAILABLE =
  "You can't use that email. Try a different one.";

export function parsePasswordChange(
  input: PasswordFields,
): { ok: true } | { ok: false; errors: PasswordErrors } {
  const errors: PasswordErrors = {};

  if (!input.current) errors.current = "Enter your current password.";

  if (input.next.length < MIN_PASSWORD_LENGTH) {
    errors.next = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  } else if (input.next.length > MAX_PASSWORD_LENGTH) {
    errors.next = `Use ${MAX_PASSWORD_LENGTH} characters or fewer.`;
  } else if (input.current && input.next === input.current) {
    errors.next = "That's your current password. Choose a new one.";
  }

  if (!errors.next && input.confirm !== input.next) {
    errors.confirm = "The two new passwords don't match. Type it again.";
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true };
}

/** Lower case and trimmed: how Better Auth stores every address. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Whether a new address is worth sending. `current` is the address on the
 * account now; it is compared after normalising, so "Me@x.com" is the same.
 */
export function parseNewEmail(
  email: string,
  current: string,
): { ok: true; email: string } | { ok: false; error: string } {
  const value = normaliseEmail(email);
  if (!value) return { ok: false, error: "Enter your new email address." };
  if (value.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(value)) {
    return {
      ok: false,
      error: "That email doesn't look right. Check it and try again.",
    };
  }
  if (value === normaliseEmail(current)) {
    return { ok: false, error: "That's already your email." };
  }
  return { ok: true, email: value };
}

/**
 * An address with most of its name hidden: "nadia@gmail.com" becomes
 * "n***@gmail.com". Enough for the owner to recognise, too little for
 * whoever else reads their inbox.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}
