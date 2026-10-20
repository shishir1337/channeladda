/**
 * The question a buyer's first message starts from.
 *
 * Deliberately a real question rather than "hi": a seller who opens their
 * inbox should find something they can answer in one reply instead of an
 * opener that costs a round trip. Shared by the server, which writes it when
 * a thread is opened without one, and the listing page, which offers it to
 * the buyer to edit before it is sent.
 */
export const OPENING_MESSAGE =
  "Hi — I'm interested in this one. Is it still available, and is there anything about the account or the handover I should know before I make an offer?";
