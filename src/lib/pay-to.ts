import type { DealActor } from "@/lib/deal-machine";
import { templateFor } from "@/lib/deal-templates";

/**
 * Where a Safest buyer pays the seller: the rules, without the database.
 *
 * On a Safest deal the price goes straight from buyer to seller, and the
 * chat cannot carry where to send it — its filter removes bKash numbers and
 * bank account numbers, which look like phone numbers, and links. Found
 * running a deal in the browser: the seller's bKash number came out as
 * "[contact details removed]" and the conversation was flagged. So the
 * seller writes it in one field on the deal, and these rules say who sees it
 * and what it may not contain.
 */

/** Enough for an address and its network, or a bank's details. */
export const MAX_PAY_TO = 500;

/**
 * The Safest step whose completion makes it the buyer's turn to pay the
 * seller: our agent verifying the channel, which puts it in custody. Read
 * from the template, so a change to the steps cannot leave this pointing at
 * the wrong one.
 */
export const BUYER_PAYS_AFTER_STEP: number =
  templateFor("SAFEST").find((step) => step.entersStatus === "IN_CUSTODY")
    ?.position ?? 0;

/**
 * Whether this person may read the seller's payment details.
 *
 * The seller wrote them, and the agent and staff are the deal's referees.
 * The buyer only from their turn to pay the seller — `reachedBuyerPayment`,
 * which the caller reads from the verification step having been completed.
 * Before that the channel is not yet in custody, and the details would be a
 * way to take the deal off the platform. Once reached it stays reached,
 * through a later dispute or ending, which the deal's status alone could
 * not show.
 */
export function payToVisibleTo(
  viewer: DealActor,
  reachedBuyerPayment: boolean,
): boolean {
  if (viewer === "seller" || viewer === "agent" || viewer === "staff") {
    return true;
  }
  return viewer === "buyer" && reachedBuyerPayment;
}

/**
 * A web address or a messaging invite, which payment details may not hold.
 *
 * A "payment link" is the classic way to send a buyer to a page that only
 * looks like a bank. A bare email address is not one: some payment services,
 * PayPal among them, are addressed by an email.
 */
const LINK =
  /\bhttps?:\/\/|\bwww\.|\b(?:t\.me|wa\.me|discord\.gg|join\.skype\.com)\//i;

export function hasPayToLink(text: string): boolean {
  return LINK.test(text);
}
