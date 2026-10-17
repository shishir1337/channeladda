/**
 * Who may still write in a conversation Channel Adda closed.
 *
 * Closing a conversation moderates what the two sides say to each other. It
 * does not silence Channel Adda's own people: staff, because closing it is
 * often the moment they need to explain why, and the deal's agent, who is
 * staff for that deal and may need to talk both sides through a transfer
 * that is already under way. Shared by the server, which enforces it, and
 * the page, which offers the message box only to those it would accept.
 */
export function writesInClosedThread(
  role: "buyer" | "seller" | "agent" | "staff",
): boolean {
  return role === "staff" || role === "agent";
}
