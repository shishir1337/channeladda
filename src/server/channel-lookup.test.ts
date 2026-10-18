import { beforeEach, expect, test, vi } from "vitest";
import type { PublicYouTubeChannel } from "@/lib/channel-pages";

// The signed-in seller, the two platforms' answers and the image store are
// replaced. What the action does with those answers is real.
const fake = vi.hoisted(() => ({
  configured: false,
  apiError: null as Error | null,
  page: null as PublicYouTubeChannel | null,
  engagement: null as number | null,
  telegram: null as unknown,
  stored: true,
  storedFrom: [] as string[],
}));

vi.mock("@/server/session", () => ({
  requireUser: async () => ({ id: "seller-1", role: "USER" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/youtube", async (original) => {
  const real = await original<typeof import("@/server/youtube")>();
  return {
    ...real,
    isYouTubeConfigured: () => fake.configured,
    fetchChannel: async () => {
      if (fake.apiError) throw fake.apiError;
      return {
        channelId: "UC_api",
        title: "Daily Tech Brief",
        description: "Reviews, weekly.",
        avatarUrl: "https://yt3.googleusercontent.com/api-avatar=s800",
        bannerUrl: "https://yt3.googleusercontent.com/api-banner=w1600",
        subscribers: 128_000,
        subscribersHidden: false,
        videos: 412,
        views: 9_100_000,
        country: "GB",
        publishedAt: yearsAgo(4),
        niche: "Technology",
        uploadsPlaylistId: "UU_api",
        canonicalUrl: "https://www.youtube.com/@dailytechbrief",
      };
    },
    recentEngagement: async () => fake.engagement,
    fetchChannelPage: async () => {
      if (!fake.page) {
        throw new real.YouTubeError("No channel there.", "not-found");
      }
      return fake.page;
    },
  };
});
vi.mock("@/server/telegram", async (original) => {
  const real = await original<typeof import("@/server/telegram")>();
  return {
    ...real,
    fetchTelegramChannel: async () => {
      if (fake.telegram instanceof Error) throw fake.telegram;
      return fake.telegram;
    },
  };
});
vi.mock("@/server/remote-image", () => ({
  storeRemoteImage: async (url: string | null, kind: string) => {
    if (!url) return null;
    fake.storedFrom.push(url);
    return fake.stored ? `/uploads/${kind}/stored.jpg` : null;
  },
}));

const { lookupChannel } = await import("@/server/actions/channel-lookup");
const { TelegramError } = await import("@/server/telegram");
const { YouTubeError } = await import("@/server/youtube");

function yearsAgo(years: number, extraDays = 30) {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  date.setUTCDate(date.getUTCDate() - extraDays);
  return date;
}

const MKBHD: PublicYouTubeChannel = {
  channelId: "UCBJycsmduvYEL83R_U4JriQ",
  title: "Marques Brownlee",
  description: "MKBHD: Quality Tech Videos",
  handle: "mkbhd",
  avatarUrl: "https://yt3.googleusercontent.com/avatar=s512",
  bannerUrl: "https://yt3.googleusercontent.com/banner=w1600",
  subscribers: 21_400_000,
  videos: 1_859,
  views: 5_784_034_004,
  country: "United States",
  joinedAt: yearsAgo(18),
};

beforeEach(() => {
  fake.configured = false;
  fake.apiError = null;
  fake.page = MKBHD;
  fake.engagement = null;
  fake.telegram = null;
  fake.stored = true;
  fake.storedFrom = [];
});

test("with no API key, a YouTube link is filled in from the channel's page", async () => {
  const result = await lookupChannel("https://www.youtube.com/@mkbhd");

  expect(result).toMatchObject({
    ok: true,
    platform: "YOUTUBE",
    manual: false,
    source: "page",
    handle: "mkbhd",
    title: "Marques Brownlee",
    subscribers: 21_400_000,
    subscribersHidden: false,
    videos: 1_859,
    views: 5_784_034_004,
    ageYears: 18,
    country: "United States",
    canonicalUrl: "https://www.youtube.com/@mkbhd",
  });
});

test("the channel's picture and banner become the listing's own uploads", async () => {
  const result = await lookupChannel("https://www.youtube.com/@mkbhd");

  // Copied in, not linked: a link to Google's copy stops working the day
  // the channel changes its picture, and every listing card would break.
  expect(fake.storedFrom).toEqual([MKBHD.avatarUrl, MKBHD.bannerUrl]);
  expect(result).toMatchObject({
    avatarUrl: "/uploads/avatar/stored.jpg",
    coverUrl: "/uploads/cover/stored.jpg",
  });
});

test("a picture that could not be copied is left for the seller to add", async () => {
  fake.stored = false;
  const result = await lookupChannel("https://www.youtube.com/@mkbhd");
  expect(result).toMatchObject({ ok: true, avatarUrl: null, coverUrl: null });
});

test("a hidden subscriber count is reported as hidden, never as zero subscribers", async () => {
  fake.page = { ...MKBHD, subscribers: null };
  const result = await lookupChannel("https://www.youtube.com/@mkbhd");
  expect(result).toMatchObject({
    ok: true,
    subscribers: 0,
    subscribersHidden: true,
  });
});

test("with an API key, the niche, banner and engagement come from Google", async () => {
  fake.configured = true;
  fake.engagement = 4.2;

  const result = await lookupChannel("https://youtube.com/@dailytechbrief");

  expect(result).toMatchObject({
    ok: true,
    source: "api",
    handle: "dailytechbrief",
    title: "Daily Tech Brief",
    subscribers: 128_000,
    ageYears: 4,
    // The API gives a code; the form asks for a name.
    country: "United Kingdom",
    niche: "Technology",
    engagement: 4.2,
  });
  if (result.ok) expect(result.engagementBasis).toMatch(/videos/);
});

test("when the shared quota is spent, the channel's page answers instead", async () => {
  fake.configured = true;
  fake.apiError = new YouTubeError("Quota exceeded.", "quota");

  const result = await lookupChannel("https://www.youtube.com/@mkbhd");

  expect(result).toMatchObject({
    ok: true,
    source: "page",
    subscribers: 21_400_000,
  });
});

test("a YouTube link to nothing says so, rather than inventing a channel", async () => {
  fake.page = null;
  const result = await lookupChannel("https://www.youtube.com/@nobody-here");
  expect(result.ok).toBe(false);
});

test("a public Telegram channel is filled in from t.me, members exact", async () => {
  fake.telegram = {
    channel: {
      kind: "channel",
      title: "Crypto Signals Daily",
      description: "Signals every morning.",
      avatarUrl: "https://cdn4.telesco.pe/file/abc.jpg",
      members: 52_318,
    },
    reach: 31.5,
  };

  const result = await lookupChannel("https://t.me/cryptosignalsdaily");

  expect(result).toMatchObject({
    ok: true,
    platform: "TELEGRAM",
    manual: false,
    source: "page",
    handle: "cryptosignalsdaily",
    title: "Crypto Signals Daily",
    subscribers: 52_318,
    engagement: 31.5,
    avatarUrl: "/uploads/avatar/stored.jpg",
    coverUrl: null,
    canonicalUrl: "https://t.me/cryptosignalsdaily",
  });
  if (result.ok) expect(result.engagementBasis).toMatch(/posts/);
});

test("a Telegram name that is not a channel is refused with the reason", async () => {
  fake.telegram = new TelegramError(
    "That is a person's profile, not a channel or group.",
  );
  const result = await lookupChannel("https://t.me/durov");
  expect(result).toEqual({
    ok: false,
    error: "That is a person's profile, not a channel or group.",
  });
});

test("an Instagram link is kept for a moderator, with nothing guessed", async () => {
  const result = await lookupChannel("https://instagram.com/natgeo");
  expect(result).toMatchObject({
    ok: true,
    platform: "INSTAGRAM",
    manual: true,
    handle: "natgeo",
    subscribers: 0,
    avatarUrl: null,
    coverUrl: null,
    source: null,
  });
  expect(fake.storedFrom).toEqual([]);
});
