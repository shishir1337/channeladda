/**
 * Whether a confirmed email address is needed before buying or selling.
 *
 * On — the owner, 2026-10-26: "turn it on", after it was switched off for
 * testing on 2026-10-24. Sign-up sends a code and buying and selling wait
 * for it. Set NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION=false and rebuild to
 * switch it off again; while off, sign-up sends no code and nobody is asked
 * to confirm, and /verify-email still works for anyone who wants to.
 *
 * Read when asked rather than once, so a test can switch it.
 */
export function emailVerificationRequired(): boolean {
  return process.env.NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION !== "false";
}

/** True when this person must confirm their address before going on. */
export function needsEmailVerification(user: {
  emailVerified: boolean;
}): boolean {
  return emailVerificationRequired() && !user.emailVerified;
}
