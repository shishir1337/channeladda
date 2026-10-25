import { isKycImageKey, isKycVideoKey, keyFromUrl } from "@/lib/upload-keys";

/**
 * Getting verified: the optional ID check behind the Verified badge.
 *
 * The owner's rule (2026-10-26): nobody has to do this. A member who wants
 * the badge sends an ID and a short selfie video, a moderator checks them by
 * hand, and only an approved check shows the badge. Nothing else on the site
 * depends on it.
 *
 * Shared by the form and the server action, so both refuse the same things
 * in the same words.
 */

export type KycDocumentId = "AADHAAR" | "PAN" | "PASSPORT" | "OTHER";

export type KycDocumentOption = {
  id: KycDocumentId;
  label: string;
  /** Under the label, when the name alone does not say what counts. */
  hint?: string;
  /** What the first photo is of. */
  front: string;
  /** Whether to ask for the back. It is never required. */
  back: boolean;
};

export const KYC_DOCUMENTS: readonly KycDocumentOption[] = [
  {
    id: "AADHAAR",
    label: "Aadhaar card",
    front: "Front of the card",
    back: true,
  },
  { id: "PAN", label: "PAN card", front: "Front of the card", back: false },
  { id: "PASSPORT", label: "Passport", front: "Photo page", back: false },
  {
    id: "OTHER",
    label: "Other government ID",
    hint: "Driving licence, voter ID or national ID",
    front: "Front of the ID",
    back: true,
  },
];

export function documentOption(id: string): KycDocumentOption | undefined {
  return KYC_DOCUMENTS.find((doc) => doc.id === id);
}

export function documentLabel(id: string | null | undefined): string {
  return (id && documentOption(id)?.label) || "ID";
}

/** What an approved check was made with, for the badge's note. */
export type VerifiedWith = { document: KycDocumentId; country: string };

/** The ID as it reads mid-sentence: "their passport details". */
const IN_A_SENTENCE: Record<KycDocumentId, string> = {
  AADHAAR: "Aadhaar card",
  PAN: "PAN card",
  PASSPORT: "passport",
  OTHER: "government ID",
};

/**
 * What the Verified badge says on hover or tap (the owner, 2026-10-26):
 * which ID they gave and a video selfie, that it can go to the police if
 * they commit fraud, and their citizenship. A badge approved by hand, with
 * no submission on file, says only what the badge means.
 */
export function verifiedNote(detail: VerifiedWith | null): string {
  if (!detail) return "Channel Adda's team has checked this person's ID.";
  return `This person has given us their ${IN_A_SENTENCE[detail.document]} details and a video selfie to confirm their identity. This means we can share this data with the police, at their request, in case of fraud on their part. Citizenship: ${detail.country}.`;
}

/** Who reviews ID checks and may see the files. FINANCE and AGENT may not. */
export const KYC_REVIEWER_ROLES = ["MODERATOR", "SUPERADMIN"] as const;

export function isKycReviewer(role: string | null | undefined): boolean {
  return KYC_REVIEWER_ROLES.includes(role as "MODERATOR");
}

/** What the member is told about how long a check takes. */
export const KYC_REVIEW_HOURS = 24;

/** Photos of the ID, in MB. The same as every other image upload. */
export const KYC_IMAGE_MAX_MB = 8;
/** The selfie video, in MB (`MAX_KYC_VIDEO_BYTES` in `@/server/storage`). */
export const KYC_VIDEO_MAX_MB = 50;
/** The video is asked for at 10 to 30 seconds; the form refuses past this. */
export const KYC_VIDEO_MAX_SECONDS = 60;

/** A reason for not approving is read by the member, so it says something. */
export const KYC_REASON_MIN = 10;
export const KYC_REASON_MAX = 300;

export type KycFields = {
  documentType: string;
  fullName: string;
  country: string;
  /** Stored upload URLs, `/uploads/kyc/...`. */
  frontUrl: string;
  /** Empty when there is no back. */
  backUrl: string;
  videoUrl: string;
};

export type KycValues = {
  documentType: KycDocumentId;
  fullName: string;
  country: string;
  frontUrl: string;
  backUrl: string | null;
  videoUrl: string;
};

export type KycErrors = Partial<Record<keyof KycFields, string>>;

export type ParsedKyc =
  | { ok: true; value: KycValues }
  | { ok: false; errors: KycErrors };

const NAME_MIN = 2;
const NAME_MAX = 80;
const COUNTRY_MAX = 56;

/** Letters in any script, and the marks some scripts write vowels with. */
const PERSON = /^[\p{L}\p{M} .'’-]+$/u;
const PLACE = /^[\p{L}\p{M} .'’()-]+$/u;

const tidy = (text: string) => text.trim().replace(/\s+/g, " ");

export function parseKyc(input: KycFields): ParsedKyc {
  const errors: KycErrors = {};

  const doc = documentOption(input.documentType);
  if (!doc) errors.documentType = "Choose which ID you are sending.";

  const fullName = tidy(input.fullName);
  if (!fullName) errors.fullName = "Enter your name as it is on your ID.";
  else if (fullName.length < NAME_MIN || fullName.length > NAME_MAX) {
    errors.fullName = `Use ${NAME_MIN} to ${NAME_MAX} characters.`;
  } else if (!PERSON.test(fullName) || !/\p{L}/u.test(fullName)) {
    errors.fullName = "Use letters only, as printed on your ID.";
  }

  const country = tidy(input.country);
  if (!country) errors.country = "Enter the country that issued your ID.";
  else if (
    country.length < 2 ||
    country.length > COUNTRY_MAX ||
    !PLACE.test(country)
  ) {
    errors.country = "Enter a country, like India.";
  }

  // Only our own `kyc/` uploads, of the right kind. A URL to anything else —
  // a listing cover, somebody's chat photo — is refused here, and whose
  // upload it is gets checked against the database on the server.
  const front = keyFromUrl(input.frontUrl.trim());
  if (!input.frontUrl.trim()) {
    errors.frontUrl = "Add a photo of your ID.";
  } else if (!front || !isKycImageKey(front)) {
    errors.frontUrl = "Upload the photo of your ID again.";
  }

  const backUrl = input.backUrl.trim();
  const back = backUrl ? keyFromUrl(backUrl) : null;
  if (backUrl && (!back || !isKycImageKey(back))) {
    errors.backUrl = "Upload the photo of the back again.";
  } else if (back && back === front) {
    errors.backUrl = "That is the same photo as the front.";
  }

  const video = keyFromUrl(input.videoUrl.trim());
  if (!input.videoUrl.trim()) {
    errors.videoUrl = "Add your selfie video.";
  } else if (!video || !isKycVideoKey(video)) {
    errors.videoUrl = "Upload your video again.";
  }

  if (!doc || Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      documentType: doc.id,
      fullName,
      country,
      frontUrl: input.frontUrl.trim(),
      backUrl: backUrl || null,
      videoUrl: input.videoUrl.trim(),
    },
  };
}

/**
 * The reviewer's reason as one sentence the member reads, so "Photo is
 * blurry" and "Photo is blurry." both end the same way before "You can try
 * again." is put after them.
 */
export function asSentence(reason: string): string {
  const text = reason.trim().replace(/\s+/g, " ");
  if (!text) return text;
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/**
 * Whether the name typed for the ID is the account's name, ignoring case,
 * spacing and punctuation. Shown to the reviewer; never decides anything.
 */
export function sameName(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLocaleLowerCase("en")
      .replace(/[^\p{L}\p{M}]+/gu, " ")
      .trim();
  return norm(a) !== "" && norm(a) === norm(b);
}
