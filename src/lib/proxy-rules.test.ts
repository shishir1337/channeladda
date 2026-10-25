import { describe, expect, it } from "vitest";
import { platforms } from "@/data/platforms";
import {
  adminNext,
  PLATFORM_IDS,
  unknownPlatformPath,
} from "@/lib/proxy-rules";

describe("unknownPlatformPath", () => {
  it("knows the same five platforms the site lists", () => {
    expect([...PLATFORM_IDS].sort()).toEqual(platforms.map((p) => p.id).sort());
  });

  it("lets every real platform page through", () => {
    for (const id of PLATFORM_IDS) {
      expect(unknownPlatformPath(`/browse/${id}`)).toBeNull();
      expect(unknownPlatformPath(`/browse/${id}/`)).toBeNull();
    }
  });

  it("sends anything else to an address no page answers", () => {
    for (const path of [
      "/browse/myspace",
      "/browse/YouTube",
      "/browse/%E0%A4",
    ]) {
      expect(unknownPlatformPath(path)).toBe("/browse/_/not-found");
    }
  });

  it("leaves the rest of the site alone", () => {
    for (const path of ["/browse", "/listing/x", "/browse/youtube/extra"]) {
      expect(unknownPlatformPath(path)).toBeNull();
    }
  });
});

describe("adminNext", () => {
  it("brings staff back to the page they were opening", () => {
    expect(adminNext("/admin/disputes")).toBe("/admin/disputes");
    expect(adminNext("/admin/users?q=rafi")).toBe("/admin/users?q=rafi");
    expect(adminNext("/admin")).toBe("/admin");
  });

  it("falls back to the staff overview for anything else", () => {
    for (const header of [
      null,
      "",
      "https://evil.test/admin",
      "//evil.test",
      "/dashboard",
      "/administrator",
    ]) {
      expect(adminNext(header)).toBe("/admin");
    }
  });
});
