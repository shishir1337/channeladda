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

test("submitting for review asks for the pictures, the proof and the link", () => {
  // The other half of the same rule. A listing about to be shown to buyers
  // needs a cover, an avatar and at least one screenshot — and the link to
  // the account, which is where the ownership check reads its code from and
  // what a moderator opens to compare the figures.
  expect(fields(listingSubmitSchema.safeParse(TYPED)).sort()).toEqual([
    "avatarUrl",
    "coverUrl",
    "proofs",
    "sourceUrl",
  ]);
});

test("a draft saves without the link", () => {
  expect(
    fields(listingDraftSchema.safeParse({ ...TYPED, sourceUrl: "" })),
  ).toEqual([]);
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
    "sourceUrl",
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

test("direction marks are taken out of what a buyer reads", () => {
  // An override can make a title seem to say something it does not.
  const result = listingDraftSchema.safeParse({
    ...TYPED,
    title: "\u202EMonetized gaming channel\u202C with 6 years of watch time",
    niche: "\u2066Gaming\u2069",
    country: "\u200FUnited States",
    description: "Uploads \u202Bdaily\u202C.",
  });
  expect(result.success).toBe(true);
  if (!result.success) return;
  expect(result.data.title).toBe(
    "Monetized gaming channel with 6 years of watch time",
  );
  expect(result.data.niche).toBe("Gaming");
  expect(result.data.country).toBe("United States");
  expect(result.data.description).toBe("Uploads daily.");
});

test("a title in Arabic is kept as typed", () => {
  const title = "قناة ألعاب مع ست سنوات من المشاهدة";
  const result = listingDraftSchema.safeParse({ ...TYPED, title });
  expect(result.success && result.data.title).toBe(title);
});

test("a title of nothing but direction marks is still too short", () => {
  expect(
    fields(
      listingSubmitSchema.safeParse({
        ...TYPED,
        title:
          "\u202E\u202E\u202E\u202E\u202E\u202E\u202E\u202E\u202E\u202E\u202E",
      }),
    ),
  ).toContain("title");
});
