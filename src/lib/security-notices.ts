/**
 * The in-app notices a change to the account's keys leaves behind: the
 * password, the email, the payout address.
 *
 * Each one used to change in silence wherever mail was not set up, which is
 * most installs — so a member whose account was taken over had nothing to
 * see on their next visit, and nothing to tell support. The bell is the one
 * place every member looks; an email goes too where mail is configured.
 *
 * In `lib` so the bell can show them as Security rather than by the kind
 * they are filed under (there is no Security kind, and adding one is a
 * migration).
 */

export const PASSWORD_CHANGED = "Your password was changed";
export const EMAIL_CHANGED = "Your email was changed";
export const PAYOUT_ADDRESS_ADDED = "Your payout address was added";
export const PAYOUT_ADDRESS_CHANGED = "Your payout address was changed";

/** What to do if it was not you, said the same way on every one. */
export const NOT_YOU =
  "If this wasn't you, contact support straight away, and change your password.";

const TITLES = [
  PASSWORD_CHANGED,
  EMAIL_CHANGED,
  PAYOUT_ADDRESS_ADDED,
  PAYOUT_ADDRESS_CHANGED,
];

export function isSecurityNotice(title: string): boolean {
  return TITLES.some((start) => title.startsWith(start));
}
