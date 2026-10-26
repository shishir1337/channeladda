import { describe, expect, it } from "vitest";
import { parseProfile } from "@/lib/profile";

const AVATAR = `/uploads/avatar/${"a".repeat(32)}.png`;

describe("parseProfile", () => {
  it("tidies a name and country, and keeps a photo of ours", () => {
    const result = parseProfile({
      name: "  Nadia   Rahman ",
      country: " Bangladesh ",
      image: AVATAR,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        name: "Nadia Rahman",
        country: "Bangladesh",
        image: AVATAR,
        bio: null,
      },
    });
  });

  it("drops direction marks from a name, a country and a bio", () => {
    const result = parseProfile({
      name: "\u202Etroppu\u2066S",
      country: "\u200FIndia\u200E",
      image: "",
      bio: "Hand over \u202Bin a day\u202C.",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        name: "troppuS",
        country: "India",
        image: null,
        bio: "Hand over in a day.",
      },
    });
  });

  it("keeps a name written in Arabic or Hebrew as typed", () => {
    for (const name of ["نادية رحمن", "דנה כהן"]) {
      expect(parseProfile({ name, country: "", image: "" })).toMatchObject({
        ok: true,
        value: { name },
      });
    }
  });

  it("refuses a name that is nothing but direction marks", () => {
    expect(
      parseProfile({ name: "\u202E\u202E\u2066", country: "", image: "" }),
    ).toMatchObject({
      ok: false,
      errors: { name: "Enter your name." },
    });
  });

  it("treats a blank country and no photo as none", () => {
    const result = parseProfile({ name: "Ravi", country: "  ", image: "" });
    expect(result).toEqual({
      ok: true,
      value: { name: "Ravi", country: null, image: null, bio: null },
    });
  });

  it("asks for a name of two to fifty characters", () => {
    expect(parseProfile({ name: " ", country: "", image: "" })).toEqual({
      ok: false,
      errors: { name: "Enter your name." },
    });
    expect(parseProfile({ name: "N", country: "", image: "" }).ok).toBe(false);
    expect(
      parseProfile({ name: "N".repeat(51), country: "", image: "" }).ok,
    ).toBe(false);
  });

  it("refuses a name that is a link or an email address", () => {
    for (const name of [
      "nadia@gmail.com",
      "wa.me/8801700000000",
      "www.mychannel.com",
      "https://t.me/nadia",
      "nadia at gmail dot com",
    ]) {
      const result = parseProfile({ name, country: "", image: "" });
      expect(result.ok, name).toBe(false);
    }
  });

  it("refuses a country that is not a place name", () => {
    const result = parseProfile({
      name: "Ravi",
      country: "call 01700000000",
      image: "",
    });
    expect(result).toEqual({
      ok: false,
      errors: { country: "Enter a country, like India." },
    });
  });

  it("only takes a photo uploaded as a profile photo", () => {
    for (const image of [
      "https://example.com/me.png",
      `/uploads/proof/${"a".repeat(32)}.png`,
      `/uploads/message/${"a".repeat(32)}.png`,
      "/uploads/avatar/../../secret.png",
    ]) {
      const result = parseProfile({ name: "Ravi", country: "", image });
      expect(result.ok, image).toBe(false);
    }
  });

  it("keeps a photo from Google sign-in that is already on the profile", () => {
    // Whether it is the member's current photo is the save's to check.
    const image = "https://lh3.googleusercontent.com/a/ACg8ocK=s256-c";
    expect(parseProfile({ name: "Ravi", country: "", image })).toMatchObject({
      ok: true,
      value: { image },
    });
  });
});

describe("a bio", () => {
  const withBio = (bio: string) =>
    parseProfile({ name: "Ravi", country: "", image: "", bio });

  it("keeps a few lines about the seller, tidied", () => {
    const result = withBio(
      "  Faceless finance channels   since 2019.\n\n\n\nI hand over in a day.  ",
    );
    expect(result).toEqual({
      ok: true,
      value: {
        name: "Ravi",
        country: null,
        image: null,
        bio: "Faceless finance channels since 2019.\n\nI hand over in a day.",
      },
    });
    expect(withBio("   ")).toMatchObject({ ok: true, value: { bio: null } });
  });

  it("is kept short", () => {
    expect(withBio("a".repeat(300)).ok).toBe(true);
    expect(withBio("a".repeat(301))).toEqual({
      ok: false,
      errors: { bio: "Keep it to 300 characters." },
    });
  });

  it("has no way to reach the seller off the site", () => {
    for (const bio of [
      "Mail me at ravi@gmail.com",
      "See https://ravi.example",
      "WhatsApp wa.me/919800000000",
      "Call +91 98000 00000",
      "t.me/ravichannels",
      // QA got this one past the @ check.
      "sana dot deals at gmail dot com",
      "ravi (at) gmail (dot) com",
    ]) {
      expect(withBio(bio), bio).toEqual({
        ok: false,
        errors: {
          bio: "Leave out links, emails and phone numbers: deals stay on Channel Adda.",
        },
      });
    }
  });

  it("can still say how big and how old a channel is", () => {
    expect(withBio("Sold 12 channels, 1.2M subscribers, since 2019.").ok).toBe(
      true,
    );
  });
});
