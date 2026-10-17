import { z } from "zod";

/**
 * What a seller may set on a listing.
 *
 * Deliberately not derived from the Prisma model. The model has fields no
 * seller is allowed near — `featured`, `status`, `watching`, `ownershipCode`,
 * `sellerId` — and generating this from the table would quietly let a new
 * column become writable the day it is added.
 *
 * Shared by the form and the action, so the browser and the server disagree
 * about nothing. The browser copy is a convenience; the server runs it again
 * because everything the browser sends is a suggestion.
 */

export const PLATFORM_IDS = [
  "youtube",
  "instagram",
  "facebook",
  "telegram",
  "website",
] as const;

/** Money arrives in dollars and is stored in cents. See `toCents`. */
const dollars = (max: number) =>
  z
    .number({ message: "Enter an amount." })
    .min(0, "That cannot be negative.")
    .max(max, `That is above the ${max.toLocaleString()} limit.`)
    .refine((n) => Number.isFinite(n), "Enter a number.");

const listingFields = z.object({
  platform: z.enum(PLATFORM_IDS, { message: "Choose a platform." }),

  handle: z
    .string()
    .trim()
    .min(2, "Enter the handle buyers would search for.")
    .max(80, "That handle is too long.")
    // A handle is an identifier, not prose. Keeping it narrow also keeps it
    // safe to put in a URL slug.
    .regex(
      /^[@]?[A-Za-z0-9][A-Za-z0-9._-]*$/,
      "Use letters, numbers, dots, dashes or underscores.",
    ),

  title: z
    .string()
    .trim()
    .min(
      10,
      "Give buyers a title with something in it — at least 10 characters.",
    )
    .max(120, "Keep the title under 120 characters."),

  niche: z.string().trim().min(2, "What is it about?").max(60, "Too long."),

  country: z
    .string()
    .trim()
    .min(2, "Where is most of the audience?")
    .max(60, "Too long."),

  audience: z
    .number({ message: "Enter the audience size." })
    .int("Whole numbers only.")
    .min(1, "That cannot be zero.")
    .max(5_000_000_000, "That is not a real audience size."),

  monetized: z.boolean(),

  /** Dollars per month. Zero is normal and not an error. */
  monthlyRevenue: dollars(10_000_000),
  /** Asked for separately rather than taken as twelve times the month: this
   *  trade is seasonal and 12x a good month is a number nobody believes. */
  yearlyRevenue: dollars(100_000_000),

  /** A percentage, e.g. 7.4. Stored as 74. */
  engagement: z
    .number({ message: "Enter an engagement rate." })
    .min(0, "That cannot be negative.")
    .max(100, "Engagement cannot be above 100%."),

  ageYears: z
    .number({ message: "How old is the account?" })
    .int("Whole years only.")
    .min(0, "That cannot be negative.")
    .max(40, "That is older than the platform."),

  /** Dollars. */
  price: dollars(50_000_000).refine(
    (n) => n >= 1,
    "Set a price of at least $1.",
  ),

  // Not required here. A draft is allowed to be half-finished, and these
  // two are the slowest fields to fill: the seller has to go and take a
  // screenshot. Requiring them to save contradicted the page's own promise
  // of "save a draft at any point" and lost everything they had typed.
  coverUrl: z.string().default(""),
  avatarUrl: z.string().default(""),

  transferProfile: z.string().trim().max(200).optional().or(z.literal("")),

  /** The link the seller pasted. Kept so staff can open what was listed. */
  sourceUrl: z
    .string()
    .trim()
    .max(300)
    .optional()
    .or(z.literal(""))
    .refine(
      (value) => !value || /^https?:\/\//i.test(value) || value.startsWith("@"),
      "Paste the full link, starting with https://",
    ),
  // externalId is deliberately NOT here. It is the channel verification is
  // checked against, and as a writable field it let a seller list one channel
  // while pointing the ownership check at another they did control — earning
  // a public verified badge on an account they had nothing to do with. The
  // server resolves it from sourceUrl at verification time instead.

  description: z
    .string()
    .trim()
    .max(
      4_000,
      "That is longer than buyers will read. Keep it under 4,000 characters.",
    )
    .optional()
    .or(z.literal("")),

  /** Staff-only, and never rendered to a buyer. */
  whatsapp: z
    .string()
    .trim()
    .max(32)
    .optional()
    .or(z.literal(""))
    .refine(
      (value) => !value || /^\+?[0-9 ()-]{7,32}$/.test(value),
      "Use the international form, e.g. +8801712345678.",
    ),

  proofs: z
    .array(
      z.object({
        url: z.string().min(1),
        label: z
          .string()
          .trim()
          .min(1, "Say what this screenshot shows.")
          .max(80),
        sha256: z.string().regex(/^[0-9a-f]{64}$/, "Bad file reference."),
      }),
    )
    .max(8, "Eight screenshots is plenty.")
    .default([]),
});

export type ListingDraftInput = z.input<typeof listingDraftSchema>;
export type ListingDraft = z.output<typeof listingDraftSchema>;

/**
 * Submitting for review asks for more than saving a draft does. A draft is
 * allowed to be half-finished; a listing about to be shown to buyers is not.
 */
export const listingSubmitSchema = listingFields.extend({
  coverUrl: z.string().min(1, "Add a cover image."),
  avatarUrl: z.string().min(1, "Add a profile picture."),
  proofs: listingFields.shape.proofs.unwrap().min(1, {
    message: "Add at least one screenshot proving the account is yours.",
  }),
});

/**
 * What a seller may save and come back to.
 *
 * Only the handle is required, because the public slug is built from it and
 * a draft with no identity is not a draft of anything. Everything else may
 * be left blank — but anything actually typed goes through the same rule and
 * the same message as it would on submission, because half-finished is not
 * the same as unchecked: a two-character title is a typo, not a work in
 * progress.
 *
 * The form has always promised “Save a draft at any point” and the comment
 * above has always said a draft is allowed to be half-finished. Until now a
 * draft also demanded a ten-character title, a niche, a country, an audience
 * figure, an engagement rate, an account age and a price of at least a
 * dollar — so a seller who typed a handle and went to find their analytics
 * came back to a form that refused to save and told them off.
 *
 * `NaN` is what the form sends for an empty number field, and empty string
 * for an empty text one. Both mean “not filled in yet” here.
 */
const blankText = z.literal("");
const blankNumber = z.custom<number>((v) => typeof v === "number" && Number.isNaN(v));

export const listingDraftSchema = listingFields.extend({
  title: z.union([blankText, listingFields.shape.title]),
  niche: z.union([blankText, listingFields.shape.niche]),
  country: z.union([blankText, listingFields.shape.country]),
  audience: z.union([blankNumber, listingFields.shape.audience]),
  engagement: z.union([blankNumber, listingFields.shape.engagement]),
  ageYears: z.union([blankNumber, listingFields.shape.ageYears]),
  price: z.union([blankNumber, listingFields.shape.price]),
  monthlyRevenue: z.union([blankNumber, listingFields.shape.monthlyRevenue]),
  yearlyRevenue: z.union([blankNumber, listingFields.shape.yearlyRevenue]),
  coverUrl: z.string().default(""),
  avatarUrl: z.string().default(""),
});

/** Dollars to integer cents, without ever letting a float reach the database. */
export function toCents(dollarAmount: number) {
  return Math.round(dollarAmount * 100);
}

export function fromCents(cents: number) {
  return cents / 100;
}

/** 7.4% is stored as 74. */
export function toEngagementBp(percent: number) {
  return Math.round(percent * 10);
}

export function fromEngagementBp(bp: number) {
  return bp / 10;
}

/**
 * Flattens a zod failure into `{ field: message }`, which is what the forms
 * already render.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
