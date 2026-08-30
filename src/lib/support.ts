/**
 * Support topics, shared by the form and the staff queue so a ticket cannot
 * arrive filed under something the queue does not know how to show.
 */
export const SUPPORT_TOPICS = [
  "A live order",
  "A listing I want to publish",
  "Payments or withdrawals",
  "Identity verification",
  "Reporting a listing or seller",
  "My account is suspended",
  "Something else",
] as const;

export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

export const MAX_SUPPORT_MESSAGE = 4000;
