import { expect, test } from "vitest";
import { newOwnershipCode, parseChannelUrl } from "@/lib/channel-url";

// ---------------------------------------------------- the four YouTube forms

test("a /channel/UC… link gives the channel id directly", () => {
  expect(
    parseChannelUrl("https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ"),
  ).toEqual({
    platform: "YOUTUBE",
    kind: "id",
    value: "UCBJycsmduvYEL83R_U4JriQ",
  });
});

test("an @handle link gives the handle without the at sign", () => {
  expect(parseChannelUrl("https://www.youtube.com/@mkbhd")).toEqual({
    platform: "YOUTUBE",
    kind: "handle",
    value: "mkbhd",
  });
});

test("a legacy /c/ or /user/ link gives a search term", () => {
  // These are not resolvable by id or handle; the API has to look them up.
  expect(parseChannelUrl("https://youtube.com/c/TechNestDaily")).toEqual({
    platform: "YOUTUBE",
    kind: "legacy",
    value: "TechNestDaily",
  });
  expect(parseChannelUrl("https://youtube.com/user/TechNestDaily")).toEqual({
    platform: "YOUTUBE",
    kind: "legacy",
    value: "TechNestDaily",
  });
});

test("a bare @handle typed without a url works", () => {
  // Sellers paste what they have. Half of them have the handle, not the link.
  expect(parseChannelUrl("@mkbhd")).toEqual({
    platform: "YOUTUBE",
    kind: "handle",
    value: "mkbhd",
  });
});

test("the mobile host, extra path and query string are all tolerated", () => {
  expect(
    parseChannelUrl("https://m.youtube.com/@mkbhd/videos?view=0&sort=dd"),
  ).toEqual({ platform: "YOUTUBE", kind: "handle", value: "mkbhd" });
  expect(parseChannelUrl("youtu.be/@mkbhd")).toEqual({
    platform: "YOUTUBE",
    kind: "handle",
    value: "mkbhd",
  });
});

test("a link with no scheme still parses", () => {
  expect(parseChannelUrl("www.youtube.com/@mkbhd")).toEqual({
    platform: "YOUTUBE",
    kind: "handle",
    value: "mkbhd",
  });
});

test("surrounding whitespace is ignored", () => {
  expect(parseChannelUrl("  https://youtube.com/@mkbhd  ")?.value).toBe(
    "mkbhd",
  );
});

// ------------------------------------------------------------ other platforms

test("instagram, telegram and facebook links are recognised", () => {
  expect(parseChannelUrl("https://instagram.com/nasa")).toEqual({
    platform: "INSTAGRAM",
    kind: "handle",
    value: "nasa",
  });
  expect(parseChannelUrl("https://t.me/durov")).toEqual({
    platform: "TELEGRAM",
    kind: "handle",
    value: "durov",
  });
  expect(parseChannelUrl("https://facebook.com/meta")).toEqual({
    platform: "FACEBOOK",
    kind: "handle",
    value: "meta",
  });
});

test("any other site is treated as a website listing", () => {
  expect(parseChannelUrl("https://example.com/blog")).toEqual({
    platform: "WEBSITE",
    kind: "domain",
    value: "example.com",
  });
});

// ------------------------------------------------------------------ rejections

test("nonsense is refused rather than guessed at", () => {
  for (const input of [
    "",
    "   ",
    "not a link",
    "ftp://x",
    "javascript:alert(1)",
  ]) {
    expect(parseChannelUrl(input)).toBeNull();
  }
});

test("a youtube link with no channel in it is refused", () => {
  // A video link is not a channel link, and silently accepting it would fetch
  // the wrong thing.
  expect(parseChannelUrl("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  expect(parseChannelUrl("https://youtube.com/")).toBeNull();
});

// -------------------------------------------------------- the ownership code

test("an ownership code is short, readable and prefixed", () => {
  const code = newOwnershipCode();
  expect(code).toMatch(/^CA-[0-9A-HJ-NP-Z]{8}$/);
});

test("the code alphabet excludes characters people mistype", () => {
  // Someone is going to read this off a screen and type it into YouTube's
  // description box. I, O, 1 and 0 are where that goes wrong.
  const codes = Array.from({ length: 200 }, () => newOwnershipCode());
  for (const code of codes) {
    expect(code.slice(3)).not.toMatch(/[IO01]/);
  }
});

test("codes do not repeat in any practical sense", () => {
  const codes = new Set(Array.from({ length: 500 }, () => newOwnershipCode()));
  expect(codes.size).toBe(500);
});
