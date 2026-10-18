import { expect, test } from "vitest";
import {
  handleFromUrl,
  newOwnershipCode,
  normaliseChannelUrl,
  parseChannelUrl,
  suggestHandle,
} from "@/lib/channel-url";

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

test("telegram's preview link names the channel after the /s/", () => {
  // t.me/s/durov is the web preview of t.me/durov. Reading "s" as the
  // channel made the lookup refuse it and the handle come out as "s".
  expect(parseChannelUrl("https://t.me/s/durov")).toEqual({
    platform: "TELEGRAM",
    kind: "handle",
    value: "durov",
  });
});

test("a post, reel or story link is not taken for the account", () => {
  // The path word would become the handle — a listing called @reel.
  for (const input of [
    "https://www.instagram.com/p/C1a2b3c4d5/",
    "https://www.instagram.com/reel/C1a2b3c4d5/",
    "https://www.instagram.com/stories/natgeo/123/",
    "https://www.instagram.com/explore/tags/travel/",
    "https://www.facebook.com/groups/123456/",
    "https://www.facebook.com/watch/?v=1",
  ]) {
    expect(parseChannelUrl(input)).toBeNull();
  }
});

test("a numbered facebook profile link has no handle to offer", () => {
  // profile.php is a page, not a name; the id is in the query string, so
  // it has to survive normalising or the link stops naming the account.
  expect(
    suggestHandle("https://www.facebook.com/profile.php?id=100064"),
  ).toBeNull();
  expect(
    normaliseChannelUrl("https://www.facebook.com/profile.php?id=100064&ref=x"),
  ).toBe("https://www.facebook.com/profile.php?id=100064");
});

test("a telegram invite link has no handle to offer", () => {
  // Private by construction, and "+AbC" or "joinchat" is not a name.
  expect(suggestHandle("https://t.me/+AbCdEfGh")).toBeNull();
  expect(suggestHandle("https://t.me/joinchat/AbCdEfGh")).toBeNull();
  expect(suggestHandle("https://t.me/durov")).toBe("durov");
});

test("the ownership check's handle is never filtered", () => {
  // Verification overwrites whatever the seller typed with the verified
  // channel's own handle. Filtering an unusual one to null there would let
  // a typed @MrBeast survive on a verified listing.
  const encoded = "https://www.youtube.com/@caf%C3%A9";
  expect(handleFromUrl(encoded)).toBe("caf%C3%A9");
  expect(suggestHandle(encoded)).toBeNull();
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

test("every symbol of the alphabet can come up", () => {
  // The code picks a symbol with the low five bits of a random byte, which
  // is only fair while the alphabet has exactly 32 of them.
  const seen = new Set(
    Array.from({ length: 400 }, () => newOwnershipCode().slice(3)).join(""),
  );
  expect(seen.size).toBe(32);
});

test("codes do not repeat in any practical sense", () => {
  const codes = new Set(Array.from({ length: 500 }, () => newOwnershipCode()));
  expect(codes.size).toBe(500);
});

// --------------------------------------------------- the handle for the form

test("a link that carries a handle gives one back", () => {
  // The seller pastes a link with their handle in it and then has to type the
  // handle anyway, because the import filled that field from the display
  // title. A channel called "Daily Tech Brief" is not @dailytechbrief, and the
  // handle is what the slug and the public URL are built from.
  expect(handleFromUrl("https://www.youtube.com/@mkbhd")).toBe("mkbhd");
  expect(handleFromUrl("@mkbhd")).toBe("mkbhd");
  expect(handleFromUrl("https://instagram.com/natgeo")).toBe("natgeo");
  expect(handleFromUrl("https://t.me/durov")).toBe("durov");
});

test("a link with no handle in it gives nothing rather than a guess", () => {
  // A channel id is not a handle, and neither is a domain. Putting either in
  // the handle field would publish a listing titled UCBJycsmduvYEL83R_U4JriQ.
  expect(
    handleFromUrl("https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ"),
  ).toBeNull();
  expect(handleFromUrl("https://example.com")).toBeNull();
  expect(handleFromUrl("https://youtube.com/c/TechNestDaily")).toBeNull();
  expect(handleFromUrl("not a link")).toBeNull();
});

test("a link without a scheme is normalised rather than passed through", () => {
  // Sellers paste what their browser shows them, which is often
  // "instagram.com/natgeo" with no https://. parseChannelUrl accepts that —
  // it prepends the scheme for its own parsing — but the value was handed
  // back to the form raw, where the listing schema refuses anything not
  // starting https://. The error key had no rendered home, so both buttons
  // did nothing, for ever, on a very ordinary paste.
  expect(normaliseChannelUrl("instagram.com/natgeo")).toBe(
    "https://instagram.com/natgeo",
  );
  expect(normaliseChannelUrl("  youtube.com/@mkbhd  ")).toBe(
    "https://youtube.com/@mkbhd",
  );
  expect(normaliseChannelUrl("https://t.me/durov")).toBe("https://t.me/durov");
  // A bare handle is allowed through untouched: the schema accepts it, and
  // turning it into a URL would guess at a platform.
  expect(normaliseChannelUrl("@mkbhd")).toBe("@mkbhd");
  expect(normaliseChannelUrl("not a link")).toBeNull();
});
