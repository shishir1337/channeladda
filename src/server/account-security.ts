import "server-only";

import { isAPIError } from "better-auth/api";
import * as z from "zod";
import {
  EMAIL_UNAVAILABLE,
  type EmailErrors,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  maskEmail,
  normaliseEmail,
  type PasswordErrors,
  type PasswordFields,
  parseNewEmail,
  parsePasswordChange,
} from "@/lib/account-security";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailVerificationRequired } from "@/lib/email-verification";
import {
  EMAIL_CHANGED,
  NOT_YOU,
  PASSWORD_CHANGED,
} from "@/lib/security-notices";
import { siteUrl } from "@/lib/site-url";
import {
  clearAttempts,
  countAttempt,
  isLimited,
  type Limit,
} from "@/server/attempt-limit";
import { recordAudit } from "@/server/audit";
import { type Mail, sendMail } from "@/server/mailer";
import { notify as notifyInApp } from "@/server/notifications";

/**
 * A member changing their own password or email, from the security page.
 *
 * Better Auth does the work — the password check, the hashing, the email
 * code — and this decides who may ask and what happens around it: the
 * current password first, tries counted per member, the "this was changed"
 * notice to the address that might have been taken over, and the audit row
 * support reads when someone says "that wasn't me".
 *
 * Every function takes the request's headers rather than a user id, so the
 * session in the cookie is the authority on whose account this is.
 */

/** Wrong current passwords, across both forms, before a pause. */
export const PASSWORD_TRIES: Limit = { max: 5, windowMs: 15 * 60_000 };
/** Addresses refused as unavailable, so the form is no way to list them. */
export const TAKEN_TRIES: Limit = { max: 5, windowMs: 15 * 60_000 };
/** Codes sent to a new address, so the form is no way to flood one. */
export const CODE_SENDS: Limit = { max: 3, windowMs: 10 * 60_000 };
/**
 * How recently someone with no password must have signed in to change
 * their email. Google proved it was them then; without a password to ask
 * for, this is what stops a borrowed phone from moving the account.
 */
export const RECENT_SIGN_IN_MS = 15 * 60_000;

const TOO_MANY_PASSWORDS =
  "Too many wrong passwords. Wait 15 minutes and try again, or reset your password from the sign-in page.";
const WRONG_PASSWORD =
  "That isn't your current password. Check it and try again.";
const NO_PASSWORD =
  "You sign in with Google, so there's no password to change.";
const SOMETHING_WENT_WRONG = "That didn't work. Try again in a minute.";

export type PasswordChangeResult =
  | { ok: true; message: string }
  | { ok: false; errors: PasswordErrors };

export type EmailChangeResult =
  /** Changed. `email` is the address now on the account. */
  | { ok: true; step: "done"; email: string; message: string }
  /** A code is on its way to `email`; `confirmEmailChange` finishes it. */
  | { ok: true; step: "code"; email: string; message: string }
  /** `reauth`: sign in with Google again, then retry. */
  | { ok: false; errors: EmailErrors; reauth?: true };

/** Which ways in this member has. A Google-only account has no password. */
export async function hasPassword(userId: string): Promise<boolean> {
  const count = await db.account.count({
    where: { userId, providerId: "credential", password: { not: null } },
  });
  return count > 0;
}

/** Better Auth's error code, or its message where it gives none. */
function authError(error: unknown): string | null {
  if (!isAPIError(error)) return null;
  const body = error.body as { code?: string; message?: string } | undefined;
  return body?.code ?? body?.message ?? error.message ?? null;
}

async function signedInUser(headers: Headers) {
  const session = await auth.api.getSession({
    headers,
    query: { disableCookieCache: true },
  });
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true },
  });
  return user ? { user, session: session.session } : null;
}

/** Sent, or logged: the change has happened, and a mail outage must not undo it. */
async function notify(mail: Mail) {
  try {
    await sendMail(mail);
  } catch (error) {
    console.error(`[account] could not send "${mail.subject}"`, error);
  }
}

const SUPPORT_LINK = () =>
  `${siteUrl()}/support?topic=${encodeURIComponent("I am locked out of my account")}`;

function passwordChangedMail(to: string): Mail {
  return {
    to,
    subject: "Your Channel Adda password was changed",
    body:
      "The password on your Channel Adda account was just changed, and you " +
      "were signed out on your other devices.\n\n" +
      "If this was you, you don't need to do anything.\n\n" +
      "If it wasn't you, contact support straight away.",
    link: SUPPORT_LINK(),
    action: "Contact support",
  };
}

function emailChangedMail(oldEmail: string, newEmail: string): Mail {
  return {
    to: oldEmail,
    subject: "Your Channel Adda email was changed",
    body:
      `The email on your Channel Adda account was just changed to ${maskEmail(newEmail)}. ` +
      "Emails about your account go there from now on.\n\n" +
      "If this was you, you don't need to do anything.\n\n" +
      "If it wasn't you, contact support straight away.",
    link: SUPPORT_LINK(),
    action: "Contact support",
  };
}

/**
 * Checks the current password for an account that has one. Wrong answers
 * count against the member; a right one clears them.
 */
async function checkPassword(
  headers: Headers,
  userId: string,
  password: string,
): Promise<"ok" | "wrong" | "limited"> {
  const key = `password:${userId}`;
  if (isLimited(key, PASSWORD_TRIES)) return "limited";
  try {
    await auth.api.verifyPassword({ body: { password }, headers });
  } catch (error) {
    if (authError(error) !== "INVALID_PASSWORD") throw error;
    countAttempt(key, PASSWORD_TRIES);
    return isLimited(key, PASSWORD_TRIES) ? "limited" : "wrong";
  }
  clearAttempts(key);
  return "ok";
}

// ------------------------------------------------------------- password

/**
 * Current password, new password, the new one again. On success every
 * other device is signed out — this one gets a fresh session — and the
 * account's address is told.
 */
export async function changePassword(
  headers: Headers,
  fields: PasswordFields,
): Promise<PasswordChangeResult> {
  const parsed = parsePasswordChange(fields);
  if (!parsed.ok) return parsed;

  const me = await signedInUser(headers);
  if (!me) return { ok: false, errors: { form: "Sign in again, then retry." } };
  const { user } = me;

  if (!(await hasPassword(user.id))) {
    return { ok: false, errors: { form: NO_PASSWORD } };
  }

  const key = `password:${user.id}`;
  if (isLimited(key, PASSWORD_TRIES)) {
    return { ok: false, errors: { form: TOO_MANY_PASSWORDS } };
  }

  try {
    await auth.api.changePassword({
      body: {
        currentPassword: fields.current,
        newPassword: fields.next,
        revokeOtherSessions: true,
      },
      headers,
    });
  } catch (error) {
    switch (authError(error)) {
      case "INVALID_PASSWORD":
        countAttempt(key, PASSWORD_TRIES);
        return isLimited(key, PASSWORD_TRIES)
          ? { ok: false, errors: { form: TOO_MANY_PASSWORDS } }
          : { ok: false, errors: { current: WRONG_PASSWORD } };
      // Caught by parsePasswordChange first; here only if the auth config
      // and the shared rules ever drift apart.
      case "PASSWORD_TOO_SHORT":
      case "PASSWORD_TOO_LONG":
        return {
          ok: false,
          errors: {
            next: `Use ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`,
          },
        };
      case "CREDENTIAL_ACCOUNT_NOT_FOUND":
        return { ok: false, errors: { form: NO_PASSWORD } };
      default:
        console.error("[account] change password failed", error);
        return { ok: false, errors: { form: SOMETHING_WENT_WRONG } };
    }
  }

  clearAttempts(key);
  await notify(passwordChangedMail(user.email));
  // In the bell too: most installs send no mail, and this is the one change
  // a member most needs to hear about when it was not them.
  await notifyInApp({
    userId: user.id,
    kind: "IDENTITY",
    title: PASSWORD_CHANGED,
    body: `You were signed out on your other devices. ${NOT_YOU}`,
    href: "/dashboard/security",
  });
  await recordAudit({
    actorId: user.id,
    action: "user.password_changed",
    entity: "user",
    entityId: user.id,
    after: { otherSessionsSignedOut: true },
  });

  return {
    ok: true,
    message: "Password changed. You've been signed out on your other devices.",
  };
}

// ---------------------------------------------------------------- email

/**
 * The first half of changing your email: who is asking, and whether the
 * address can be used. With confirmation off it is also the last half —
 * the address changes here. With it on, a code goes to the new address and
 * `confirmEmailChange` finishes once it is typed.
 */
export async function requestEmailChange(
  headers: Headers,
  fields: { email: string; password: string },
): Promise<EmailChangeResult> {
  const me = await signedInUser(headers);
  if (!me) return { ok: false, errors: { form: "Sign in again, then retry." } };
  const { user, session } = me;

  const parsed = parseNewEmail(fields.email, user.email);
  if (!parsed.ok) return { ok: false, errors: { email: parsed.error } };
  // Better Auth's own rule for an address, so nothing passes here that it
  // would refuse when the code is confirmed.
  if (!z.email().safeParse(parsed.email).success) {
    return {
      ok: false,
      errors: {
        email: "That email doesn't look right. Check it and try again.",
      },
    };
  }
  const newEmail = parsed.email;

  // Who is asking comes before anything about the address, so the form
  // says nothing about other accounts to someone who cannot prove this one.
  if (await hasPassword(user.id)) {
    if (!fields.password) {
      return {
        ok: false,
        errors: { password: "Enter your current password." },
      };
    }
    const check = await checkPassword(headers, user.id, fields.password);
    if (check === "limited") {
      return { ok: false, errors: { form: TOO_MANY_PASSWORDS } };
    }
    if (check === "wrong") {
      return { ok: false, errors: { password: WRONG_PASSWORD } };
    }
  } else if (
    Date.now() - new Date(session.createdAt).getTime() >
    RECENT_SIGN_IN_MS
  ) {
    return {
      ok: false,
      reauth: true,
      errors: {
        form: "To keep your account safe, sign in with Google again first. Then change your email.",
      },
    };
  }

  const takenKey = `taken:${user.id}`;
  if (isLimited(takenKey, TAKEN_TRIES)) {
    return {
      ok: false,
      errors: { form: "Too many tries. Wait 15 minutes and try again." },
    };
  }
  if (await emailInUse(newEmail, user.id)) {
    countAttempt(takenKey, TAKEN_TRIES);
    return { ok: false, errors: { email: EMAIL_UNAVAILABLE } };
  }

  if (!emailVerificationRequired()) {
    try {
      // Not confirmed, because nothing has proved this inbox yet. That is
      // also what keeps a Google sign-in for the new address from being
      // joined to this account (Better Auth links only to a confirmed one).
      await db.user.update({
        where: { id: user.id },
        data: { email: newEmail, emailVerified: false, emailVerifiedAt: null },
      });
    } catch (error) {
      // Somebody took the address between the check and the write.
      if ((error as { code?: string }).code === "P2002") {
        return { ok: false, errors: { email: EMAIL_UNAVAILABLE } };
      }
      throw error;
    }
    // The session cookie keeps the old address for a minute; read the
    // session afresh so the header shows the new one at once.
    await auth.api.getSession({ headers, query: { disableCookieCache: true } });
    await afterEmailChange(user, newEmail, false);
    return {
      ok: true,
      step: "done",
      email: newEmail,
      message: `Your email is now ${newEmail}.`,
    };
  }

  const codeKey = `code:${user.id}`;
  if (isLimited(codeKey, CODE_SENDS)) {
    return {
      ok: false,
      errors: {
        form: "We've sent a few codes already. Wait 10 minutes and try again.",
      },
    };
  }
  countAttempt(codeKey, CODE_SENDS);
  try {
    await auth.api.requestEmailChangeEmailOTP({ body: { newEmail }, headers });
  } catch (error) {
    console.error("[account] could not send the change-email code", error);
    return {
      ok: false,
      errors: {
        form: "We couldn't send the code. Try again in a few minutes.",
      },
    };
  }
  return {
    ok: true,
    step: "code",
    email: newEmail,
    message: `We sent a 6-digit code to ${newEmail}.`,
  };
}

/** The second half, when confirmation is on: the code from the new inbox. */
export async function confirmEmailChange(
  headers: Headers,
  fields: { email: string; code: string },
): Promise<EmailChangeResult> {
  const me = await signedInUser(headers);
  if (!me) return { ok: false, errors: { form: "Sign in again, then retry." } };
  const { user } = me;

  const newEmail = normaliseEmail(fields.email);
  const code = fields.code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) {
    return {
      ok: false,
      errors: { code: "Enter the 6-digit code from the email." },
    };
  }

  try {
    await auth.api.changeEmailEmailOTP({
      body: { newEmail, otp: code },
      headers,
    });
  } catch (error) {
    switch (authError(error)) {
      case "INVALID_OTP":
        return {
          ok: false,
          errors: {
            code: "That code isn't right. Check the email and try again.",
          },
        };
      case "OTP_EXPIRED":
        return {
          ok: false,
          errors: { code: "That code has expired. Send a new one." },
        };
      case "TOO_MANY_ATTEMPTS":
        return {
          ok: false,
          errors: { code: "Too many wrong codes. Send a new one." },
        };
      case "Email already in use":
        return { ok: false, errors: { email: EMAIL_UNAVAILABLE } };
      default:
        console.error("[account] confirm email change failed", error);
        return { ok: false, errors: { form: SOMETHING_WENT_WRONG } };
    }
  }

  await afterEmailChange(user, newEmail, true);
  return {
    ok: true,
    step: "done",
    email: newEmail,
    message: `Your email is now ${newEmail}.`,
  };
}

/** Case-blind, and never the member's own row. */
async function emailInUse(email: string, userId: string): Promise<boolean> {
  const other = await db.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      id: { not: userId },
    },
    select: { id: true },
  });
  return other !== null;
}

/** The old address hears about it: it is the one a hijacker wants rid of. */
async function afterEmailChange(
  user: { id: string; email: string },
  newEmail: string,
  confirmed: boolean,
) {
  await notify(emailChangedMail(user.email, newEmail));
  await notifyInApp({
    userId: user.id,
    kind: "IDENTITY",
    title: `${EMAIL_CHANGED} to ${maskEmail(newEmail)}`,
    body: `Emails about your account go there from now on. ${NOT_YOU}`,
    href: "/dashboard/security",
  });
  await recordAudit({
    actorId: user.id,
    action: "user.email_changed",
    entity: "user",
    entityId: user.id,
    before: { email: user.email },
    after: { email: newEmail, confirmed },
  });
}
