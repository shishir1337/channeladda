import type { Platform } from "@/generated/prisma/enums";
import { channelLink } from "@/lib/channel-link";

/**
 * The buyer's own account that receives ownership, asked for before they pay.
 *
 * Without it a Fastest seller reached "Promote the buyer to primary owner"
 * not knowing who the buyer was on YouTube, and had to ask in the chat and
 * wait — and a typo there handed a channel to a stranger. What the field
 * holds depends on how each platform transfers, so the question does too.
 */
export type HandoverTarget = {
  label: string;
  placeholder: string;
  /** One line under the field: who uses it, and for what. */
  hint: string;
  /** What is wrong, in the same words as the label. */
  error: string;
};

const TARGETS: Record<Platform, HandoverTarget> = {
  YOUTUBE: {
    label: "Google account to make owner",
    placeholder: "you@gmail.com",
    hint: "The channel's ownership is moved to this Google account.",
    error: "Enter the Google account email that should become owner.",
  },
  INSTAGRAM: {
    label: "Email to move the account to",
    placeholder: "you@example.com",
    hint: "The account's login email is changed to this address.",
    error: "Enter the email address the account should move to.",
  },
  FACEBOOK: {
    label: "Facebook account",
    placeholder: "you@example.com or facebook.com/you",
    hint: "This account is added to the Page with full control.",
    error: "Enter your Facebook email or a link to your profile.",
  },
  TELEGRAM: {
    label: "Telegram username",
    placeholder: "@yourname",
    hint: "Ownership of the channel is transferred to this username.",
    error: "Enter your Telegram username, like @yourname.",
  },
  WEBSITE: {
    label: "Email for the domain transfer",
    placeholder: "you@example.com",
    hint: "The registrar transfer and hosting handover go to this address.",
    error: "Enter the email address the domain transfer goes to.",
  },
};

export function handoverTarget(platform: Platform): HandoverTarget {
  return TARGETS[platform];
}

const MAX = 254;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Telegram's own rule: 5 to 32 characters, letters, digits and underscores.
const TELEGRAM_USERNAME = /^[A-Za-z0-9_]{5,32}$/;

export function parseHandoverTo(
  platform: Platform,
  raw: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const fail = { ok: false as const, error: TARGETS[platform].error };
  const value = raw.trim();
  if (!value || value.length > MAX) return fail;

  if (platform === "TELEGRAM") {
    // People paste their t.me link as often as their @name.
    const name = value
      .replace(/^https:\/\/(t|telegram)\.me\//i, "")
      .replace(/^@/, "")
      .replace(/\/$/, "");
    return TELEGRAM_USERNAME.test(name)
      ? { ok: true, value: `@${name}` }
      : fail;
  }

  if (platform === "FACEBOOK" && /^https?:\/\//i.test(value)) {
    const link = channelLink("FACEBOOK", value);
    return link ? { ok: true, value: link.href } : fail;
  }

  return EMAIL.test(value) ? { ok: true, value: value.toLowerCase() } : fail;
}
