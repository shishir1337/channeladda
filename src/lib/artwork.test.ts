import { describe, expect, it } from "vitest";
import { artworkProps, resizable } from "@/lib/artwork";

const hex = "c".repeat(32);

describe("artworkProps", () => {
  it("sends an uploaded cover through the image optimiser, with a srcset", () => {
    const props = artworkProps({
      src: `/uploads/cover/${hex}.jpg`,
      width: 480,
      height: 240,
      sizes: "(min-width: 640px) 50vw, 85vw",
    });
    expect(props.src).toMatch(
      new RegExp(
        `^/_next/image\\?url=%2Fuploads%2Fcover%2F${hex}\\.jpg&w=\\d+&q=75$`,
      ),
    );
    expect(props.srcSet).toContain("640w");
    expect(props.sizes).toBe("(min-width: 640px) 50vw, 85vw");
    expect(props.loading).toBe("lazy");
  });

  it("picks a 1× and a 2× copy for a picture drawn at a fixed size", () => {
    const props = artworkProps({
      src: `/uploads/avatar/${hex}.png`,
      width: 48,
      height: 48,
      eager: true,
    });
    expect(props.srcSet).toMatch(/&w=48&q=75 1x, .*&w=96&q=75 2x$/);
    expect(props.loading).toBe("eager");
    expect(props.width).toBe(48);
  });

  it("leaves everything that is not public artwork exactly as it was", () => {
    for (const src of [
      "/media/covers/yt-7192.svg",
      `/uploads/avatar/${hex}.gif`,
      "https://lh3.googleusercontent.com/a/photo",
      `/uploads/proof/${hex}.png`,
      `/uploads/message/${hex}.jpg`,
      `/uploads/kyc/${hex}.jpg`,
    ]) {
      expect(artworkProps({ src, width: 64, height: 64 })).toEqual({
        src,
        width: 64,
        height: 64,
        loading: "lazy",
        decoding: "async",
      });
      expect(resizable(src)).toBe(false);
    }
  });
});
