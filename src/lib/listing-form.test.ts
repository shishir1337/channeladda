import { expect, test } from "vitest";
import {
  type ListingDraftInput,
  listingDraftSchema,
  listingSubmitSchema,
} from "@/lib/listing-form";

/**
 * Everything a seller can realistically have typed before they go hunting for
 * screenshots: the figures, the price, the words. No files.
 */
const TYPED: ListingDraftInput = {
  platform: "youtube",
  handle: "MrBeast",
  title: "Monetized gaming channel with 6 years of watch time",
  niche: "Gaming",
  country: "United States",
  audience: 250_000,
  monetized: true,
  monthlyRevenue: 0,
  yearlyRevenue: 0,
  engagement: 6.2,
  ageYears: 6,
  price: 7_500,
  coverUrl: "",
  avatarUrl: "",
  proofs: [],
};

const fields = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[] }[] };
}) =>
  result.success
    ? []
    : (result.error?.issues ?? []).map((i) => String(i.path[0]));

test("a draft saves without the pictures", () => {
  // The page promises "Save a draft at any point" and the submit schema's own
  // comment says a draft is allowed to be half-finished. Requiring two
  // uploads to save one made both false: a seller with the figures but not
  // the screenshots clicked Save draft and got told to add a cover image.
  expect(fields(listingDraftSchema.safeParse(TYPED))).toEqual([]);
});

test("submitting for review asks for the pictures and the proof", () => {
  // The other half of the same rule. A listing about to be shown to buyers
  // needs a cover, an avatar and at least one screenshot.
  expect(fields(listingSubmitSchema.safeParse(TYPED)).sort()).toEqual([
    "avatarUrl",
    "coverUrl",
    "proofs",
  ]);
});

test("a draft still checks what the seller did type", () => {
  // Half-finished is not the same as unchecked: a draft with a two-character
  // title or a negative price is a typo, not a work in progress.
  expect(
    fields(listingDraftSchema.safeParse({ ...TYPED, title: "hi" })),
  ).toEqual(["title"]);
  expect(fields(listingDraftSchema.safeParse({ ...TYPED, price: 0 }))).toEqual([
    "price",
  ]);
});

test("a draft needs only the thing that identifies the account", () => {
  // The page says "Save a draft at any point" and the submit schema's comment
  // says a draft is allowed to be half-finished. Both were false: a draft
  // still demanded a ten-character title, a niche, a country, an audience
  // figure, both revenue figures, an engagement rate, an account age and a
  // price of at least a dollar. A seller who had typed a handle and gone to
  // find their analytics lost everything.
  //
  // The handle stays, because the slug is built from it and a draft with no
  // identity is not a draft of anything.
  const barely: ListingDraftInput = {
    platform: "youtube",
    handle: "mkbhd",
    title: "",
    niche: "",
    country: "",
    audience: Number.NaN,
    monetized: false,
    monthlyRevenue: Number.NaN,
    yearlyRevenue: Number.NaN,
    engagement: Number.NaN,
    ageYears: Number.NaN,
    price: Number.NaN,
    coverUrl: "",
    avatarUrl: "",
    proofs: [],
  };

  expect(fields(listingDraftSchema.safeParse(barely))).toEqual([]);
});

test("submitting one for review still asks for all of it", () => {
  const barely: ListingDraftInput = {
    platform: "youtube",
    handle: "mkbhd",
    title: "",
    niche: "",
    country: "",
    audience: Number.NaN,
    monetized: false,
    monthlyRevenue: Number.NaN,
    yearlyRevenue: Number.NaN,
    engagement: Number.NaN,
    ageYears: Number.NaN,
    price: Number.NaN,
    coverUrl: "",
    avatarUrl: "",
    proofs: [],
  };

  // Every field it left blank, each with its own message.
  expect(fields(listingSubmitSchema.safeParse(barely)).sort()).toEqual([
    "ageYears",
    "audience",
    "avatarUrl",
    "country",
    "coverUrl",
    "engagement",
    "monthlyRevenue",
    "niche",
    "price",
    "proofs",
    "title",
    "yearlyRevenue",
  ]);
});

test("a draft still refuses a handle that is not one", () => {
  // Half-finished is not unchecked. The handle goes into a public URL.
  const bad = {
    platform: "youtube",
    handle: "not a handle!",
  } as ListingDraftInput;
  expect(fields(listingDraftSchema.safeParse(bad))).toContain("handle");
});
