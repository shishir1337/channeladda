import { expect, test } from "vitest";
import { channelLink } from "@/lib/channel-link";

// The chat header opens the account itself, on its own platform. The URL is
// typed by the seller, so it is only ever used when it is an https link to
// that platform: anything else stays out of an href a buyer will click.

test("a YouTube channel opens on YouTube", () => {
  expect(
    channelLink("YOUTUBE", "https://www.youtube.com/@LoFiDreamRadio"),
  ).toEqual({
    href: "https://www.youtube.com/@LoFiDreamRadio",
    label: "Open on YouTube",
  });
  expect(
    channelLink("YOUTUBE", "https://youtube.com/channel/UC123")?.href,
  ).toBe("https://youtube.com/channel/UC123");
  expect(channelLink("YOUTUBE", "https://m.youtube.com/@x")?.href).toBe(
    "https://m.youtube.com/@x",
  );
});

test("each platform accepts its own hosts", () => {
  expect(
    channelLink("INSTAGRAM", "https://instagram.com/travel.frames")?.label,
  ).toBe("Open on Instagram");
  expect(
    channelLink("FACEBOOK", "https://www.facebook.com/recipecorner")?.label,
  ).toBe("Open on Facebook");
  expect(channelLink("TELEGRAM", "https://t.me/jobalertsindia")?.label).toBe(
    "Open on Telegram",
  );
  expect(channelLink("WEBSITE", "https://gadgetgrade.com")?.label).toBe(
    "Open the website",
  );
});

test("a link to another platform, or to a lookalike host, is refused", () => {
  expect(channelLink("YOUTUBE", "https://instagram.com/x")).toBeNull();
  expect(
    channelLink("YOUTUBE", "https://youtube.com.evil.example/@x"),
  ).toBeNull();
  expect(channelLink("TELEGRAM", "https://nott.me/x")).toBeNull();
});

test("only https links are ever used", () => {
  expect(channelLink("YOUTUBE", "http://www.youtube.com/@x")).toBeNull();
  expect(channelLink("WEBSITE", "javascript:alert(1)")).toBeNull();
  expect(channelLink("WEBSITE", "not a url")).toBeNull();
});

test("no link at all is no button", () => {
  expect(channelLink("YOUTUBE", null)).toBeNull();
  expect(channelLink("YOUTUBE", "")).toBeNull();
});
