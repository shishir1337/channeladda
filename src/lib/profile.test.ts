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
      value: { name: "Nadia Rahman", country: "Bangladesh", image: AVATAR },
    });
  });

  it("treats a blank country and no photo as none", () => {
    const result = parseProfile({ name: "Ravi", country: "  ", image: "" });
    expect(result).toEqual({
      ok: true,
      value: { name: "Ravi", country: null, image: null },
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
});
