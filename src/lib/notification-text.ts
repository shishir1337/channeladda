/**
 * Words a notification is recognised by, where its kind alone is not enough.
 *
 * A balance correction is stored as a PAYOUT notification — there is no
 * kind of its own, and adding one is a migration — so the bell called it a
 * "Payout". Its body begins with this; the bell reads it to label the row.
 */
export const BALANCE_CORRECTION_BODY = "Channel Adda corrected your balance";
