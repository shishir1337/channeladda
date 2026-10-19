/**
 * Support topics, shared by the form and the staff queue so a ticket cannot
 * arrive filed under something the queue does not know how to show.
 */
export const SUPPORT_TOPICS = [
  "A live order",
  "A listing I want to publish",
  "Ordering a service",
  "Payments or withdrawals",
  "Identity verification",
  "Reporting a listing or seller",
  "My account is suspended",
  "I am locked out of my account",
  "The affiliate programme",
  "Something else",
] as const;

export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

/**
 * The support page with a topic already chosen. Typed, because the
 * two-factor page linked to `?topic=account`, which is not a topic, and the
 * form quietly ignored it.
 */
export function supportHref(topic: SupportTopic): string {
  return `/support?topic=${encodeURIComponent(topic)}`;
}

export const MAX_SUPPORT_MESSAGE = 4000;
