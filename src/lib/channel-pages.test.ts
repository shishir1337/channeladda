import { expect, test } from "vitest";
import {
  countryName,
  engagementPercent,
  fullBannerUrl,
  nicheFromTopics,
  parseCount,
  parseJoinedDate,
  parseTelegramPage,
  parseTelegramPostViews,
  parseYouTubeAboutPage,
  postReachPercent,
  wholeYearsSince,
} from "@/lib/channel-pages";

// -------------------------------------------------------------- the numbers

test("a count reads the way YouTube and Telegram print it", () => {
  expect(parseCount("21.4M subscribers")).toBe(21_400_000);
  expect(parseCount("1.8K videos")).toBe(1_800);
  expect(parseCount("1,859 videos")).toBe(1_859);
  expect(parseCount("5,784,034,004 views")).toBe(5_784_034_004);
  // Telegram groups digits with spaces on the full page.
  expect(parseCount("10 337 817 subscribers")).toBe(10_337_817);
  expect(parseCount("1.2B views")).toBe(1_200_000_000);
  expect(parseCount("1 subscriber")).toBe(1);
});

test("a count that is not there is null, never zero", () => {
  // Zero would land in the audience field as though it were a fact.
  expect(parseCount("No subscribers")).toBeNull();
  expect(parseCount("")).toBeNull();
  expect(parseCount("@durov")).toBeNull();
});

test("the joined line becomes a date, and whole years since it", () => {
  const joined = parseJoinedDate("Joined Mar 21, 2008");
  expect(joined?.getUTCFullYear()).toBe(2008);
  expect(joined?.getUTCMonth()).toBe(2);
  expect(parseJoinedDate("Joined sometime")).toBeNull();

  const now = new Date("2026-10-18T00:00:00Z");
  expect(wholeYearsSince(new Date("2008-03-21T00:00:00Z"), now)).toBe(18);
  // A day short of the anniversary is still the year before.
  expect(wholeYearsSince(new Date("2020-10-19T00:00:00Z"), now)).toBe(5);
  expect(wholeYearsSince(new Date("2030-01-01T00:00:00Z"), now)).toBe(0);
});

// ---------------------------------------------------------- the YouTube page

/** The parts of a real /about page this reads, in the shape YouTube sends. */
function youtubeAboutHtml(overrides: { about?: object; metadata?: object }) {
  const data = {
    metadata: {
      channelMetadataRenderer: {
        title: "Marques Brownlee",
        description: "MKBHD: Quality Tech Videos",
        externalId: "UCBJycsmduvYEL83R_U4JriQ",
        avatar: {
          thumbnails: [
            {
              url: "https://yt3.googleusercontent.com/qu4Tm=s900-c-k-c0x00ffffff-no-rj",
              width: 900,
              height: 900,
            },
          ],
        },
        vanityChannelUrl: "http://www.youtube.com/@mkbhd",
        ...overrides.metadata,
      },
    },
    header: {
      pageHeaderRenderer: {
        content: {
          pageHeaderViewModel: {
            banner: {
              imageBannerViewModel: {
                image: {
                  sources: [
                    {
                      url: "https://yt3.googleusercontent.com/zi_48H=w1060-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj",
                      width: 1060,
                      height: 175,
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
    contents: {
      // A featured channel on the same page, with its own count. The parser
      // must not take this one.
      shelf: {
        subscriberCountText: { simpleText: "1.17M subscribers" },
      },
    },
    onResponseReceivedEndpoints: [
      {
        showEngagementPanelEndpoint: {
          engagementPanel: {
            aboutChannelRenderer: {
              metadata: {
                aboutChannelViewModel: {
                  description: "MKBHD: Quality Tech Videos",
                  country: "United States",
                  subscriberCountText: "21.4M subscribers",
                  viewCountText: "5,784,034,004 views",
                  joinedDateText: { content: "Joined Mar 21, 2008" },
                  canonicalChannelUrl: "http://www.youtube.com/@mkbhd",
                  channelId: "UCBJycsmduvYEL83R_U4JriQ",
                  videoCountText: "1,859 videos",
                  ...overrides.about,
                },
              },
            },
          },
        },
      },
    ],
  };
  return `<!doctype html><html><head><title>Marques Brownlee - YouTube</title></head><body><script nonce="abc">var ytInitialData = ${JSON.stringify(data)};</script><script>var other = {};</script></body></html>`;
}

test("an about page gives the channel's public facts", () => {
  const facts = parseYouTubeAboutPage(youtubeAboutHtml({}));
  expect(facts).toEqual({
    channelId: "UCBJycsmduvYEL83R_U4JriQ",
    title: "Marques Brownlee",
    description: "MKBHD: Quality Tech Videos",
    handle: "mkbhd",
    avatarUrl:
      "https://yt3.googleusercontent.com/qu4Tm=s512-c-k-c0x00ffffff-no-rj",
    bannerUrl:
      "https://yt3.googleusercontent.com/zi_48H=w1600-fcrop64=1,00000000ffffffff-k-c0xffffffff-no-nd-rj",
    subscribers: 21_400_000,
    videos: 1_859,
    views: 5_784_034_004,
    country: "United States",
    joinedAt: new Date(Date.UTC(2008, 2, 21)),
  });
});

test("the window form of the data is read too", () => {
  const html = youtubeAboutHtml({}).replace(
    "var ytInitialData = ",
    'window["ytInitialData"] = ',
  );
  expect(parseYouTubeAboutPage(html)?.subscribers).toBe(21_400_000);
});

test("a hidden subscriber count is null, not the featured channel's", () => {
  const facts = parseYouTubeAboutPage(
    youtubeAboutHtml({ about: { subscriberCountText: undefined } }),
  );
  expect(facts?.subscribers).toBeNull();
});

test("a channel with no handle keeps a null handle, not its id", () => {
  // The id is not something a buyer searches for, and the slug is built
  // from the handle.
  const facts = parseYouTubeAboutPage(
    youtubeAboutHtml({
      metadata: {
        vanityChannelUrl:
          "http://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ",
      },
      about: {
        canonicalChannelUrl:
          "http://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ",
      },
    }),
  );
  expect(facts?.handle).toBeNull();
});

test("a page with no channel data on it is null", () => {
  expect(
    parseYouTubeAboutPage("<html><body>Before you continue</body></html>"),
  ).toBeNull();
  expect(
    parseYouTubeAboutPage("<script>var ytInitialData = {not json};</script>"),
  ).toBeNull();
});

test("the full banner is asked for, not the cropped strip", () => {
  expect(
    fullBannerUrl(
      "https://yt3.googleusercontent.com/zi_48H=w2120-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj",
    ),
  ).toBe(
    "https://yt3.googleusercontent.com/zi_48H=w1600-fcrop64=1,00000000ffffffff-k-c0xffffffff-no-nd-rj",
  );
  // The API hands back the base URL with no size at all.
  expect(fullBannerUrl("https://yt3.googleusercontent.com/abc")).toBe(
    "https://yt3.googleusercontent.com/abc=w1600-fcrop64=1,00000000ffffffff-k-c0xffffffff-no-nd-rj",
  );
  // Never rewritten into a request to somewhere else.
  expect(fullBannerUrl("https://example.com/banner.jpg")).toBeNull();
});

// ------------------------------------------------------------- the API's bits

test("a topic link becomes a niche, skipping the catch-all ones", () => {
  expect(
    nicheFromTopics([
      "https://en.wikipedia.org/wiki/Lifestyle_(sociology)",
      "https://en.wikipedia.org/wiki/Technology",
    ]),
  ).toBe("Technology");
  expect(
    nicheFromTopics(["https://en.wikipedia.org/wiki/Video_game_culture"]),
  ).toBe("Video game culture");
  expect(
    nicheFromTopics(["https://en.wikipedia.org/wiki/Lifestyle_(sociology)"]),
  ).toBe("Lifestyle");
  expect(nicheFromTopics([])).toBeNull();
});

test("a country code becomes the name the form asks for", () => {
  expect(countryName("US")).toBe("United States");
  expect(countryName("BD")).toBe("Bangladesh");
  expect(countryName("")).toBeNull();
  expect(countryName("not a code")).toBeNull();
});

test("engagement is likes and comments over views, across recent videos", () => {
  expect(
    engagementPercent([
      { views: 1_000, likes: 50, comments: 10 },
      { views: 3_000, likes: 150, comments: 30 },
      { views: 1_000, likes: 40, comments: 20 },
    ]),
  ).toBe(6);
  // Too few videos to say anything a buyer should believe.
  expect(
    engagementPercent([{ views: 1_000, likes: 50, comments: 10 }]),
  ).toBeNull();
  expect(
    engagementPercent([
      { views: 0, likes: 0, comments: 0 },
      { views: 0, likes: 0, comments: 0 },
      { views: 0, likes: 0, comments: 0 },
    ]),
  ).toBeNull();
});

// --------------------------------------------------------- the Telegram pages

const TELEGRAM_CHANNEL = `<html><head>
<meta property="og:title" content="Pavel Durov &amp; friends">
<meta property="og:image" content="https://cdn4.telesco.pe/file/HvmQ.jpg">
<meta property="og:description" content="Founder of Telegram.&#10;Thoughts.">
</head><body>
<div class="tgme_page_title"><span dir="auto">Pavel Durov</span></div>
<div class="tgme_page_extra">10 337 817 subscribers</div>
</body></html>`;

test("a public channel page gives its name, picture and exact members", () => {
  expect(parseTelegramPage(TELEGRAM_CHANNEL)).toEqual({
    kind: "channel",
    title: "Pavel Durov & friends",
    description: "Founder of Telegram.\nThoughts.",
    avatarUrl: "https://cdn4.telesco.pe/file/HvmQ.jpg",
    members: 10_337_817,
  });
});

test("a group counts members, before the online figure", () => {
  const group = TELEGRAM_CHANNEL.replace(
    "10 337 817 subscribers",
    "12 345 members, 301 online",
  );
  expect(parseTelegramPage(group)).toMatchObject({
    kind: "group",
    members: 12_345,
  });
});

test("a person's profile and a missing name are told apart from a channel", () => {
  const person = TELEGRAM_CHANNEL.replace("10 337 817 subscribers", "@durov");
  expect(parseTelegramPage(person)?.kind).toBe("person");

  const missing = `<html><head><meta property="og:title" content="Telegram: Contact @nobodyhere"><meta property="og:image" content="https://telegram.org/img/t_logo.png"></head><body></body></html>`;
  expect(parseTelegramPage(missing)).toBeNull();
});

test("Telegram's own logo is not taken for the channel's picture", () => {
  const plain = TELEGRAM_CHANNEL.replace(
    "https://cdn4.telesco.pe/file/HvmQ.jpg",
    "https://telegram.org/img/t_logo.png?1",
  );
  expect(parseTelegramPage(plain)?.avatarUrl).toBeNull();
});

test("the preview page gives the views on each recent post", () => {
  const preview = `
    <span class="tgme_widget_message_views">1.58M</span>
    <span class="tgme_widget_message_views">912K</span>
    <span class="tgme_widget_message_views">2 100</span>`;
  expect(parseTelegramPostViews(preview)).toEqual([1_580_000, 912_000, 2_100]);
  expect(parseTelegramPostViews("<html></html>")).toEqual([]);
});

test("post reach is average views over members, from enough posts", () => {
  expect(postReachPercent([2_000, 3_000, 4_000], 10_000)).toBe(30);
  expect(postReachPercent([2_000, 3_000], 10_000)).toBeNull();
  expect(postReachPercent([2_000, 3_000, 4_000], 0)).toBeNull();
  // Forwards can push views past the member count; a rate above 100% would
  // be refused by the form, so it stops at the ceiling.
  expect(postReachPercent([50_000, 60_000, 70_000], 10_000)).toBe(100);
});
