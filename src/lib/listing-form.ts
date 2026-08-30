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

export const listingDraftSchema = z.object({
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

  coverUrl: z.string().min(1, "Add a cover image."),
  avatarUrl: z.string().min(1, "Add a profile picture."),

  transferProfile: z.string().trim().max(200).optional().or(z.literal("")),

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
export const listingSubmitSchema = listingDraftSchema.extend({
  proofs: listingDraftSchema.shape.proofs.unwrap().min(1, {
    message: "Add at least one screenshot proving the account is yours.",
  }),
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
