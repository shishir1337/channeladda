import { z } from "zod";
import { stripBidi } from "@/lib/bidi";
import { CONTACT_REFUSED, hasContactDetails } from "@/lib/contact-details";
import {
  parseAmount,
  parseCount,
  parsePercent,
  UNREADABLE,
} from "@/lib/typed-number";

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

/**
 * A number field as the form sends it: the text the seller typed, read the
 * way people write numbers — "30,500", "$1,250", "4.5%" (`@/lib/typed-number`).
 * A number is taken as it is.
 *
 * Blank is NaN, which is "not filled in yet": a draft allows it and sending
 * refuses it with the field's own message. Text that cannot be read is
 * refused here, saying what to type. It used to become NaN as well — the
 * form ran it through `Number()` — so a draft saved "30,500" followers and
 * a "1,250" price as 0, and a live listing answered "1,250" with "Enter an
 * amount.", as if nothing had been typed.
 */
function typed<T extends z.ZodType>(
  parse: (raw: string) => number,
  unreadable: string,
  schema: T,
) {
  return z.preprocess((value: number | string, ctx) => {
    if (typeof value !== "string") return value;
    if (value.trim() === "") return Number.NaN;
    const n = parse(value);
    if (Number.isNaN(n)) {
      ctx.addIssue({ code: "custom", message: unreadable, input: value });
    }
    return n;
  }, schema);
}

const asCount = <T extends z.ZodType>(schema: T) =>
  typed(parseCount, UNREADABLE.count, schema);
const asYears = <T extends z.ZodType>(schema: T) =>
  typed(parseCount, UNREADABLE.years, schema);
const asPercent = <T extends z.ZodType>(schema: T) =>
  typed(parsePercent, UNREADABLE.percent, schema);
const asAmount = <T extends z.ZodType>(schema: T) =>
  typed(parseAmount, UNREADABLE.amount, schema);

/**
 * Blank (NaN), or the figure. Not `z.union([z.nan(), figure])`: a fraction
 * fails both branches on its type, and a union then answers "Invalid input"
 * instead of the figure's own "Whole numbers only."
 */
function blankOr(figure: z.ZodType<number>) {
  return z
    .custom<number>((value) => typeof value === "number", "Enter a number.")
    .superRefine((value, ctx) => {
      if (Number.isNaN(value)) return;
      const read = figure.safeParse(value);
      if (read.success) return;
      for (const issue of read.error.issues) {
        ctx.addIssue({ code: "custom", message: issue.message });
      }
    });
}

/** The figures, once read: what each must be. */
const FIGURE = {
  audience: z
    .number({ message: "Enter the audience size." })
    .int("Whole numbers only.")
    .min(1, "That cannot be zero.")
    .max(5_000_000_000, "That is not a real audience size."),

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
};

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

  // Direction marks out first, on everything a buyer reads: an override
  // can make a title or a description seem to say something it does not.
  title: z
    .string()
    .overwrite(stripBidi)
    .trim()
    .min(
      10,
      "Give buyers a title with something in it — at least 10 characters.",
    )
    .max(120, "Keep the title under 120 characters."),

  niche: z
    .string()
    .overwrite(stripBidi)
    .trim()
    .min(2, "What is it about?")
    .max(60, "Too long."),

  country: z
    .string()
    .overwrite(stripBidi)
    .trim()
    .min(2, "Where is most of the audience?")
    .max(60, "Too long."),

  audience: asCount(FIGURE.audience),
  monetized: z.boolean(),
  monthlyRevenue: asAmount(FIGURE.monthlyRevenue),
  yearlyRevenue: asAmount(FIGURE.yearlyRevenue),
  engagement: asPercent(FIGURE.engagement),
  ageYears: asYears(FIGURE.ageYears),
  price: asAmount(FIGURE.price),

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
    .overwrite(stripBidi)
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
      "Use the international form, e.g. +919876543210.",
    ),

  proofs: z
    .array(
      z.object({
        url: z.string().min(1),
        // Optional (the owner, 2026-10-30): a note helps the moderator, but
        // the screenshot is the proof.
        label: z.string().trim().max(80, "Keep it under 80 characters."),
        sha256: z.string().regex(/^[0-9a-f]{64}$/, "Bad file reference."),
      }),
    )
    .max(8, "Eight screenshots is plenty.")
    .default([]),
});

export type ListingDraftInput = z.input<typeof listingDraftSchema>;
export type ListingDraft = z.output<typeof listingDraftSchema>;

/** Every field a buyer reads that a seller writes in their own words. */
const BUYER_TEXT = [
  "title",
  "niche",
  "description",
  "transferProfile",
] as const;

/**
 * No way to reach the seller off the site, in anything a buyer reads — the
 * bio's rule and the bio's words. The account's own handle may be named.
 *
 * Run whether or not the rest of the form passed (`when`), so a title with
 * a phone number in it is pointed out alongside a missing price, not after.
 */
function noContactDetails(
  value: Record<string, unknown>,
  ctx: z.RefinementCtx,
) {
  const allow = typeof value.handle === "string" ? value.handle : null;
  for (const key of BUYER_TEXT) {
    const text = value[key];
    if (typeof text === "string" && hasContactDetails(text, { allow })) {
      ctx.addIssue({ code: "custom", path: [key], message: CONTACT_REFUSED });
    }
  }
}

const EVEN_IF_INVALID = { when: () => true };

/**
 * Submitting for review asks for more than saving a draft does. A draft is
 * allowed to be half-finished; a listing about to be shown to buyers is not.
 */
const LINK_NEEDED =
  "Paste the link to the account — the ownership check reads it, and a moderator opens it.";

const submitFields = listingFields.extend({
  // Blank (NaN from the form) is allowed here and refused below for every
  // platform but a website, which has visits rather than a feed to engage
  // with: Website sellers could not send a listing without inventing one.
  engagement: asPercent(blankOr(FIGURE.engagement)),
  coverUrl: z.string().min(1, "Add a cover image."),
  avatarUrl: z.string().min(1, "Add a profile picture."),
  proofs: listingFields.shape.proofs.unwrap().min(1, {
    message: "Add at least one screenshot proving the account is yours.",
  }),
  // Optional on a draft, required here: without it there is nothing for the
  // ownership code to be read from, and nothing for a moderator to open.
  sourceUrl: z
    .string({ message: LINK_NEEDED })
    .trim()
    .min(1, LINK_NEEDED)
    .max(300)
    .refine(
      (value) => /^https?:\/\//i.test(value) || value.startsWith("@"),
      "Paste the full link, starting with https://",
    ),
});

/** An engagement rate, for everything but a website. */
function engagementUnlessWebsite(
  value: { platform?: unknown; engagement?: unknown },
  ctx: z.RefinementCtx,
) {
  if (value.platform === "website") return;
  if (typeof value.engagement === "number" && Number.isNaN(value.engagement)) {
    ctx.addIssue({
      code: "custom",
      path: ["engagement"],
      message: "Enter an engagement rate.",
    });
  }
}

export const listingSubmitSchema = submitFields
  .superRefine(noContactDetails, EVEN_IF_INVALID)
  .superRefine(engagementUnlessWebsite, EVEN_IF_INVALID);

/**
 * What may change on a listing buyers can already see.
 *
 * Everything a buyer reads, held to the same rules as sending it was — a
 * live listing cannot lose its cover or its price. Not which account it is:
 * the platform, the handle and the link are what the ownership check proved,
 * and a different account is a new listing. They may be sent along, but only
 * so the server can refuse a change to them rather than quietly drop it.
 * Not the proof screenshots either: they are what a moderator checked, not
 * something a buyer reads.
 *
 * Nor the figures the moderator checked against those screenshots — the
 * audience, the revenue, the engagement, whether it is monetized and how old
 * it is (`VERIFIED_FACTS`). Raising 48,200 followers to 980,000 the day after
 * approval used to go straight in front of buyers. They are optional for the
 * same reason the account is: sent only so a change can be refused.
 */
export const listingLiveEditSchema = submitFields
  .pick({
    title: true,
    niche: true,
    country: true,
    price: true,
    coverUrl: true,
    avatarUrl: true,
    transferProfile: true,
    description: true,
    whatsapp: true,
  })
  .extend({
    platform: listingFields.shape.platform.optional(),
    handle: z.string().trim().max(300).optional(),
    sourceUrl: z.string().trim().max(300).optional(),
    audience: listingFields.shape.audience.optional(),
    monetized: listingFields.shape.monetized.optional(),
    monthlyRevenue: listingFields.shape.monthlyRevenue.optional(),
    yearlyRevenue: listingFields.shape.yearlyRevenue.optional(),
    engagement: listingFields.shape.engagement.optional(),
    ageYears: listingFields.shape.ageYears.optional(),
  })
  .superRefine(noContactDetails, EVEN_IF_INVALID);

export type ListingLiveEditInput = z.input<typeof listingLiveEditSchema>;
export type ListingLiveEdit = z.output<typeof listingLiveEditSchema>;

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
 * A blank number field reads as `NaN` (see `typed`), and an empty text one
 * is an empty string. Both mean “not filled in yet” here.
 */
const blankText = z.literal("");

export const listingDraftSchema = listingFields
  .extend({
    title: z.union([blankText, listingFields.shape.title]),
    niche: z.union([blankText, listingFields.shape.niche]),
    country: z.union([blankText, listingFields.shape.country]),
    audience: asCount(blankOr(FIGURE.audience)),
    engagement: asPercent(blankOr(FIGURE.engagement)),
    ageYears: asYears(blankOr(FIGURE.ageYears)),
    price: asAmount(blankOr(FIGURE.price)),
    monthlyRevenue: asAmount(blankOr(FIGURE.monthlyRevenue)),
    yearlyRevenue: asAmount(blankOr(FIGURE.yearlyRevenue)),
    coverUrl: z.string().default(""),
    avatarUrl: z.string().default(""),
  })
  .superRefine(noContactDetails, EVEN_IF_INVALID);

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
