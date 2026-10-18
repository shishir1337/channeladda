import { describe, expect, test } from "vitest";
import {
  type ImportableChannel,
  type ImportableDraft,
  listingTitleFor,
  mergeImport,
  undoImport,
} from "@/lib/listing-import";

const BLANK: ImportableDraft = {
  platform: "youtube",
  sourceUrl: "https://youtube.com/@mkbhd",
  handle: "mkbhd",
  title: "",
  niche: "",
  country: "",
  audience: "",
  ageYears: "",
  engagement: "",
  avatarUrl: null,
  coverUrl: null,
};

const MKBHD: ImportableChannel = {
  platform: "YOUTUBE",
  canonicalUrl: "https://www.youtube.com/@mkbhd",
  handle: "mkbhd",
  title: "Marques Brownlee",
  avatarUrl: "/uploads/avatar/a.jpg",
  coverUrl: "/uploads/cover/c.jpg",
  subscribers: 21_400_000,
  ageYears: 18,
  country: "United States",
  niche: "Technology",
  engagement: 1.3,
};

const merge = (
  current: ImportableDraft,
  channel = MKBHD,
  previous: ImportableChannel | null = null,
) => mergeImport(current, channel, previous, "YouTube");

describe("filling a listing from a fetched channel", () => {
  test("every blank the channel can answer is filled, and named", () => {
    const { next, filled } = merge(BLANK);

    expect(next).toMatchObject({
      sourceUrl: "https://www.youtube.com/@mkbhd",
      // The channel's own name, as the listing title.
      title: "Marques Brownlee",
      niche: "Technology",
      country: "United States",
      audience: "21400000",
      ageYears: "18",
      engagement: "1.3",
      avatarUrl: "/uploads/avatar/a.jpg",
      coverUrl: "/uploads/cover/c.jpg",
    });
    // The handle was already the channel's, so it is not counted.
    expect(filled).toEqual([
      "title",
      "avatarUrl",
      "coverUrl",
      "audience",
      "ageYears",
      "country",
      "niche",
      "engagement",
    ]);
  });

  test("what the seller typed is kept", () => {
    const { next, filled } = merge({
      ...BLANK,
      title: "Monetized tech channel, 18 years of uploads",
      niche: "Tech reviews",
    });
    expect(next.title).toBe("Monetized tech channel, 18 years of uploads");
    expect(next.niche).toBe("Tech reviews");
    expect(filled).not.toContain("title");
    expect(filled).not.toContain("niche");
  });

  test("a saved listing's zeros and empty pictures count as blank", () => {
    // The edit page hands blank figures back as "0" and pictures as "".
    const { next } = merge({
      ...BLANK,
      audience: "0",
      ageYears: "0",
      engagement: "0",
      avatarUrl: "",
      coverUrl: "",
    });
    expect(next).toMatchObject({
      audience: "21400000",
      ageYears: "18",
      engagement: "1.3",
      avatarUrl: "/uploads/avatar/a.jpg",
      coverUrl: "/uploads/cover/c.jpg",
    });
  });

  test("a second channel replaces what the first one filled, not what was typed", () => {
    const first = merge(BLANK).next;
    const other: ImportableChannel = {
      ...MKBHD,
      canonicalUrl: "https://www.youtube.com/@veritasium",
      handle: "veritasium",
      title: "Veritasium",
      niche: "Education",
      subscribers: 21_000_000,
    };
    const { next } = merge({ ...first, country: "Global" }, other, MKBHD);
    expect(next).toMatchObject({
      handle: "veritasium",
      title: "Veritasium",
      niche: "Education",
      audience: "21000000",
      // Typed after the first fetch, so it stays.
      country: "Global",
    });
  });

  test("what the wrong channel filled goes, even where the right one has nothing", () => {
    const wrong = merge(BLANK).next;
    const { next } = merge(
      wrong,
      { ...MKBHD, niche: null, engagement: null },
      MKBHD,
    );
    expect(next.niche).toBe("");
    expect(next.engagement).toBe("");
  });

  test("a figure the channel does not have is left as it was", () => {
    const { next, filled } = merge(BLANK, {
      ...MKBHD,
      niche: null,
      country: null,
      engagement: null,
      coverUrl: null,
    });
    expect(next).toMatchObject({
      niche: "",
      country: "",
      engagement: "",
      coverUrl: null,
    });
    expect(filled).not.toContain("niche");
    expect(filled).not.toContain("coverUrl");
  });
});

describe("the listing title", () => {
  test("is the channel's own name", () => {
    expect(listingTitleFor("Marques Brownlee", "YouTube")).toBe(
      "Marques Brownlee",
    );
  });

  test("is lengthened only as far as the ten-character minimum needs", () => {
    expect(listingTitleFor("MKBHD", "YouTube")).toBe("MKBHD — YouTube channel");
  });

  test("is shortened to the 120-character limit", () => {
    const long = "A".repeat(128);
    const title = listingTitleFor(long, "Telegram");
    expect(title).toHaveLength(120);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("undoing a fill", () => {
  test("puts back exactly what the fill changed", () => {
    const before: ImportableDraft = {
      ...BLANK,
      sourceUrl: "youtube.com/@mkbhd",
    };
    const { next: after } = merge(before);
    expect(undoImport(after, before, after)).toEqual(before);
  });

  test("keeps anything the seller changed after the fill", () => {
    const before = BLANK;
    const { next: after } = merge(before);
    const edited = { ...after, title: "My own better title for this" };
    const undone = undoImport(edited, before, after);
    expect(undone.title).toBe("My own better title for this");
    expect(undone.audience).toBe("");
    expect(undone.avatarUrl).toBeNull();
  });
});
