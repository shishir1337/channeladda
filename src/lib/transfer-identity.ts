import type { Platform } from "@/generated/prisma/enums";

/**
 * An agent's transfer identity: the account a seller hands the deal to.
 *
 * It used to be one email, so a Telegram seller was told "Make this account
 * an admin: transfers@channeladda.test" — and a Telegram admin or owner can
 * only be a Telegram username (QA, CA-87042). Each platform hands over to
 * its own kind of account:
 *
 * - YouTube: a Google account, which becomes the channel's owner.
 * - Instagram: an email, which the account's login moves to.
 * - Website: an email, which the domain and hosting move to.
 * - Telegram: a username, made an admin and then the owner.
 * - Facebook: a Facebook account, added to the Page with full control —
 *   by its email or its profile link, the two things Meta finds it by.
 *
 * So the agent keeps three (YouTube, Instagram and websites share the
 * email), and a deal copies the one for its platform at assignment into
 * `Order.agentEmail`, which is that deal's transfer identity whatever it is.
 * Pure, so every rule here is pinned by a test.
 */

export type IdentityField = "email" | "telegram" | "facebook";

export type TransferIds = {
  email: string | null;
  telegram: string | null;
  facebook: string | null;
};

export const IDENTITY_FIELD: Readonly<Record<Platform, IdentityField>> = {
  YOUTUBE: "email",
  INSTAGRAM: "email",
  WEBSITE: "email",
  TELEGRAM: "telegram",
  FACEBOOK: "facebook",
};

/** The identity a deal on this platform is handed to, or null if unset. */
export function identityFor(
  platform: Platform,
  ids: Partial<TransferIds> | null | undefined,
): string | null {
  const value = ids?.[IDENTITY_FIELD[platform]]?.trim();
  return value ? value : null;
}

/** What the identity is, on this platform, in a few words. */
const NAMES: Readonly<Record<Platform, string>> = {
  YOUTUBE: "Google account",
  INSTAGRAM: "email",
  WEBSITE: "email",
  TELEGRAM: "Telegram username",
  FACEBOOK: "Facebook account",
};

export function identityName(platform: Platform): string {
  return NAMES[platform];
}

/** How sellers use it, for the line beside it on the staff desk. */
const USES: Readonly<Record<Platform, string>> = {
  YOUTUBE: "Sellers invite this Google account as owner",
  INSTAGRAM: "The account's login moves to this email",
  WEBSITE: "The domain and hosting move to this email",
  TELEGRAM: "Sellers make this username an admin, then owner",
  FACEBOOK: "Sellers add this account to their Page",
};

export function identityUse(platform: Platform): string {
  return USES[platform];
}

/** The form's three fields, in plain words. */
export const IDENTITY_FIELDS: readonly {
  field: IdentityField;
  label: string;
  hint: string;
  placeholder: string;
}[] = [
  {
    field: "email",
    label: "Email for YouTube, Instagram and websites",
    hint: "YouTube: the Google account that will own the channels you hold. Instagram and websites: the email the account, domain and hosting move to.",
    placeholder: "transfers@channeladda.com",
  },
  {
    field: "telegram",
    label: "Telegram username",
    hint: "Telegram sellers make it an admin of their channel, then its owner. 5 to 32 letters, numbers or underscores.",
    placeholder: "@channeladda_transfers",
  },
  {
    field: "facebook",
    label: "Facebook account",
    hint: "Facebook sellers add it to their Page with full control. Its email, or its profile link.",
    placeholder: "facebook.com/channeladda.transfers",
  },
];

type Parsed = { ok: true; value: string | null } | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmail(raw: string): Parsed {
  const value = raw.trim().toLowerCase();
  if (!value) return { ok: true, value: null };
  return EMAIL.test(value)
    ? { ok: true, value }
    : { ok: false, error: "That email is not an email address." };
}

/**
 * "@name", "name" or a t.me link, kept as "@name". Telegram's own rule: 5 to
 * 32 characters, letters, numbers and underscores, starting with a letter.
 */
export function parseTelegram(raw: string): Parsed {
  let value = raw.trim();
  if (!value) return { ok: true, value: null };
  value = value
    .replace(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(value) || value.endsWith("_")) {
    return {
      ok: false,
      error:
        "A Telegram username is 5 to 32 letters, numbers or underscores, starting with a letter — like @channeladda_transfers.",
    };
  }
  return { ok: true, value: `@${value}` };
}

/** An email, or a facebook.com profile link, kept as typed but tidied. */
export function parseFacebook(raw: string): Parsed {
  const value = raw.trim();
  if (!value) return { ok: true, value: null };
  if (value.includes("@") && !/facebook\.com|fb\.com/i.test(value)) {
    return parseEmail(value);
  }
  const link = value
    .replace(/^(?:https?:\/\/)?(?:(?:www|m|web)\.)?/i, "")
    .replace(/\/+$/, "");
  if (/^(?:facebook\.com|fb\.com)\/[^\s/]+\S*$/i.test(link)) {
    return {
      ok: true,
      value: `https://www.${link.replace(/^fb\.com/i, "facebook.com")}`,
    };
  }
  return {
    ok: false,
    error:
      "Give the Facebook account's email, or its profile link — like facebook.com/channeladda.transfers.",
  };
}

/**
 * The three fields as typed, checked. A blank one is unset: an agent who
 * runs only YouTube deals needs no Telegram username. At least one is
 * needed, or there is nothing for any seller to hand a deal to.
 */
export function parseTransferIds(input: {
  email?: string | null;
  telegram?: string | null;
  facebook?: string | null;
}):
  | { ok: true; value: TransferIds }
  | { ok: false; error: string; field: IdentityField | null } {
  const email = parseEmail(input.email ?? "");
  if (!email.ok) return { ...email, field: "email" };
  const telegram = parseTelegram(input.telegram ?? "");
  if (!telegram.ok) return { ...telegram, field: "telegram" };
  const facebook = parseFacebook(input.facebook ?? "");
  if (!facebook.ok) return { ...facebook, field: "facebook" };
  if (!email.value && !telegram.value && !facebook.value) {
    return {
      ok: false,
      error: "Give at least one account sellers can hand a deal to.",
      field: null,
    };
  }
  return {
    ok: true,
    value: {
      email: email.value,
      telegram: telegram.value,
      facebook: facebook.value,
    },
  };
}

/** The addresses among them that could be somebody's sign-in email. */
export function emailsIn(ids: TransferIds): string[] {
  return [ids.email, ids.facebook]
    .filter((value): value is string => value !== null && EMAIL.test(value))
    .map((value) => value.toLowerCase());
}

/** What is missing, said as what it is for. */
const MISSING: Readonly<Record<Platform, string>> = {
  YOUTUBE: "Google account for YouTube sellers to invite as owner",
  INSTAGRAM: "email for Instagram accounts to move to",
  WEBSITE: "email for websites to move to",
  TELEGRAM: "Telegram username for sellers to make an admin",
  FACEBOOK: "Facebook account for sellers to add to their Page",
};

/**
 * Why a deal cannot be taken or given yet, and where to fix it: for the
 * person themselves, or for staff giving it to somebody else.
 */
export function missingIdentity(
  platform: Platform,
  who: { self: true } | { self: false; name: string },
): string {
  if (who.self) {
    return `Your transfer identity has no ${MISSING[platform]} yet. Set it under Your deal desk, on your Security page, then take this deal.`;
  }
  return `${who.name}'s transfer identity has no ${MISSING[platform]} yet. Set it on their Team page first.`;
}
