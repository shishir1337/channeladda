/**
 * Whether a confirmed email address is needed before buying or selling.
 *
 * Off for now — the owner, 2026-10-24: "temporary disable needs otp email
 * verification". While it is off, sign-up sends no code, nothing waits on
 * one, and nobody is asked to confirm; /verify-email still works for anyone
 * who wants to. Set NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION=true and rebuild
 * to turn it back on.
 *
 * Read when asked rather than once, so a test can turn it on.
 */
export function emailVerificationRequired(): boolean {
  return process.env.NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION === "true";
}

/** True when this person must confirm their address before going on. */
export function needsEmailVerification(user: {
  emailVerified: boolean;
}): boolean {
  return emailVerificationRequired() && !user.emailVerified;
}
