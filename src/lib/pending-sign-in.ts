/**
 * Whether a sign-in is half done: the password was accepted and the
 * authenticator code is still to come.
 *
 * Better Auth keeps that state in a short-lived cookie of its own, named
 * from the prefix in `src/lib/auth.ts` (`advanced.cookiePrefix`) and the
 * two-factor plugin's `two_factor`, with the `__Secure-` prefix wherever
 * cookies are marked secure — production. Only its presence is read here;
 * whether it is genuine is decided by the verify call, as before.
 */
const NAMES = [
  "channeladda.two_factor",
  "__Secure-channeladda.two_factor",
] as const;

export function hasPendingTwoFactor(jar: {
  has(name: string): boolean;
}): boolean {
  return NAMES.some((name) => jar.has(name));
}
