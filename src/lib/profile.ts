import { keyFromUrl } from "@/lib/upload-keys";

/**
 * What a member may say about themselves: a name, a country and a photo.
 *
 * Checked here, once, for the form and the action alike. The name is shown
 * beside every listing and in every chat, so it may not be a phone number,
 * a link or an email address — the usual way to take a deal off the site.
 */
export type ProfileFields = { name: string; country: string; image: string };

export type ProfileValues = {
  name: string;
  country: string | null;
  image: string | null;
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

const tidy = (text: string) => text.trim().replace(/\s+/g, " ");

export function parseProfile(input: ProfileFields): ParsedProfile {
  const errors: ProfileErrors = {};

  const name = tidy(input.name);
  if (!name) errors.name = "Enter your name.";
  else if (name.length < NAME_MIN || name.length > NAME_MAX) {
    errors.name = `Use ${NAME_MIN} to ${NAME_MAX} characters.`;
  } else if (CONTACT.test(name) || !/\p{L}/u.test(name)) {
    errors.name = "Use your name only, with no links, emails or numbers.";
  }

  const country = tidy(input.country);
  if (country && (country.length > COUNTRY_MAX || !PLACE.test(country))) {
    errors.country = "Enter a country, like India.";
  }

  const image = input.image.trim();
  if (image && !keyFromUrl(image)?.startsWith("avatar/")) {
    errors.image = "Choose your photo again.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { name, country: country || null, image: image || null },
  };
}
