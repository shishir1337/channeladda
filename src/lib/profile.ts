import { stripBidi } from "@/lib/bidi";
import {
  CONTACT_REFUSED,
  hasContactDetails,
  hasSpelledEmail,
} from "@/lib/contact-details";
import { isGooglePhotoUrl } from "@/lib/google-photo";
import { keyFromUrl } from "@/lib/upload-keys";

/**
 * What a member may say about themselves: a name, a country, a photo and a
 * short bio.
 *
 * Checked here, once, for the form and the action alike. The name is shown
 * beside every listing and in every chat, so it may not be a phone number,
 * a link or an email address — the usual way to take a deal off the site.
 * The bio is on the seller's public page, where buyers decide whom to
 * trust, so the same goes for it.
 */
export type ProfileFields = {
  name: string;
  country: string;
  image: string;
  /** Absent from a form that does not show it: kept as none. */
  bio?: string;
};

export type ProfileValues = {
  name: string;
  country: string | null;
  image: string | null;
  bio: string | null;
};

export type ProfileErrors = Partial<Record<keyof ProfileFields, string>>;

export type ParsedProfile =
  | { ok: true; value: ProfileValues }
  | { ok: false; errors: ProfileErrors };

const NAME_MIN = 2;
const NAME_MAX = 50;
const COUNTRY_MAX = 56;

/** An address, a link or a run of digits: contact details in a name. */
const CONTACT =
  /@|https?:|www\.|\.(com|net|org|me|io|in|bd|pk)\b|\b(wa|t)\.me\b|\d{5,}/i;

const PLACE = /^[\p{L} .'’()-]+$/u;

/** A few lines on the seller's public page. */
export const BIO_MAX = 300;

/**
 * Direction marks go first: a name drawn as "Support" but stored backwards
 * behind an override is how a stranger passes for staff in a chat.
 */
const tidy = (text: string) => stripBidi(text).trim().replace(/\s+/g, " ");

/** Each line tidied, and no more than one blank line between paragraphs. */
const tidyLines = (text: string) =>
  stripBidi(text)
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export function parseProfile(input: ProfileFields): ParsedProfile {
  const errors: ProfileErrors = {};

  const name = tidy(input.name);
  if (!name) errors.name = "Enter your name.";
  else if (name.length < NAME_MIN || name.length > NAME_MAX) {
    errors.name = `Use ${NAME_MIN} to ${NAME_MAX} characters.`;
  } else if (
    CONTACT.test(name) ||
    hasSpelledEmail(name) ||
    !/\p{L}/u.test(name)
  ) {
    errors.name = "Use your name only, with no links, emails or numbers.";
  }

  const country = tidy(input.country);
  if (country && (country.length > COUNTRY_MAX || !PLACE.test(country))) {
    errors.country = "Enter a country, like India.";
  }

  // A Google sign-in photo still on Google's host is kept as it is; the save
  // allows it only when it is the member's current photo.
  const image = input.image.trim();
  if (
    image &&
    !keyFromUrl(image)?.startsWith("avatar/") &&
    !isGooglePhotoUrl(image)
  ) {
    errors.image = "Choose your photo again.";
  }

  const bio = tidyLines(input.bio ?? "");
  if (bio.length > BIO_MAX) {
    errors.bio = `Keep it to ${BIO_MAX} characters.`;
  } else if (hasContactDetails(bio)) {
    // The rule every listing is held to as well: as in a name, but a run of
    // digits is a phone number only from nine — a bio may say "since 2019"
    // or "120000 views" — and an email spelled out to dodge the @ counts.
    errors.bio = CONTACT_REFUSED;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      country: country || null,
      image: image || null,
      bio: bio || null,
    },
  };
}
