import { afterEach, describe, expect, it, vi } from "vitest";
import {
  imagekitEndpoint,
  imagekitUrl,
  mediaFolder,
  mediaPath,
} from "@/lib/media";

const hex = "a".repeat(32);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("where uploads are delivered from", () => {
  it("is the app itself until ImageKit is set up", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT", "");
    expect(imagekitEndpoint()).toBeNull();
    expect(imagekitUrl(`cover/${hex}.png`)).toBeNull();
  });

  it("is ImageKit's address, however the endpoint was written", () => {
    for (const written of [
      "https://ik.imagekit.io/channeladda",
      "https://ik.imagekit.io/channeladda/",
      " https://ik.imagekit.io/channeladda// ",
    ]) {
      vi.stubEnv("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT", written);
      expect(imagekitEndpoint()).toBe("https://ik.imagekit.io/channeladda");
    }
  });

  it("keeps each upload under one folder, uploads unless told otherwise", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGEKIT_FOLDER", "");
    expect(mediaFolder()).toBe("uploads");
    expect(mediaPath(`cover/${hex}.png`)).toBe(`/uploads/cover/${hex}.png`);
    // A copy of the site on a laptop keeps its files apart from the live one.
    vi.stubEnv("NEXT_PUBLIC_IMAGEKIT_FOLDER", "/dev-uploads/");
    expect(mediaPath(`kyc/${hex}.jpg`)).toBe(`/dev-uploads/kyc/${hex}.jpg`);
  });

  it("asks ImageKit for a resized copy when given a width", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT", "https://ik.imagekit.io/x");
    vi.stubEnv("NEXT_PUBLIC_IMAGEKIT_FOLDER", "");
    expect(imagekitUrl(`cover/${hex}.png`)).toBe(
      `https://ik.imagekit.io/x/uploads/cover/${hex}.png`,
    );
    expect(imagekitUrl(`cover/${hex}.png`, { width: 639.6, quality: 75 })).toBe(
      `https://ik.imagekit.io/x/uploads/cover/${hex}.png?tr=w-640,q-75`,
    );
  });
});
