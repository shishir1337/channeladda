import { getImageProps } from "next/image";
import type { ImgHTMLAttributes } from "react";
import { imagekitEndpoint, imagekitUrl } from "@/lib/media";
import { isPublicKey, keyFromUrl } from "@/lib/upload-keys";

/**
 * The attributes for a listing cover, an account's picture or a seller's
 * photo, sized for where it is drawn.
 *
 * Uploads are kept as the seller sent them: a 1600×900 cover went to a
 * card 290 pixels wide, and a 600-pixel photo to a 48-pixel circle. A
 * public upload — a cover or an avatar — goes through Next's image
 * optimiser, which resizes it, re-encodes it as WebP and caches the result,
 * with a `srcset` so a phone takes the small copy and a retina screen the
 * sharp one. Once uploads live on ImageKit, its CDN makes those copies
 * instead (`imageKitProps`).
 *
 * Everything else is left exactly as it was, on purpose:
 * - the sample artwork is SVG, which has nothing to resize;
 * - a GIF would lose its animation;
 * - a photo from Google sign-in is on another site the optimiser is not
 *   allowed to fetch from;
 * - and nothing permission-checked — a proof, a chat file, an ID photo — is
 *   ever handed to the optimiser, which fetches without the visitor's
 *   cookie. `next.config.ts` allows only the two public kinds as well.
 *
 * A plain `<img>` with these spread on it, rather than `next/image`, so the
 * markup and the classes on every card stay as they were.
 */
export function artworkProps({
  src,
  width,
  height,
  sizes,
  eager = false,
}: {
  src: string;
  /** CSS pixels, as drawn; the 2× copy is picked for retina screens. */
  width: number;
  height: number;
  /** For an image whose width follows the layout, as on a card. */
  sizes?: string;
  /** Above the fold: fetched at once rather than when scrolled to. */
  eager?: boolean;
}): ImgHTMLAttributes<HTMLImageElement> {
  const loading = eager ? "eager" : "lazy";
  const fromImageKit = imageKitProps(src, width, height, sizes);
  if (fromImageKit) return { ...fromImageKit, loading, decoding: "async" };
  if (!resizable(src)) {
    return { src, width, height, loading, decoding: "async" };
  }
  const { props } = getImageProps({
    src,
    alt: "",
    width,
    height,
    sizes,
    loading,
    quality: 75,
  });
  // `alt` is the caller's to set, and `style` would only paint the alt text
  // transparent — these pictures are decorative and carry their own classes.
  const { alt: _alt, style: _style, ...rest } = props;
  return rest;
}

/** A public upload the optimiser may resize. */
export function resizable(src: string): boolean {
  const key = keyFromUrl(src);
  return key !== null && isPublicKey(key) && !key.endsWith(".gif");
}

/**
 * Widths offered to a browser for a picture whose width follows the
 * layout: a phone takes 384 or 640, a laptop 1080, a large screen 1920.
 */
const LADDER = [256, 384, 640, 828, 1080, 1200, 1920];

/**
 * The same, once uploads live on ImageKit: its own resized copies, from its
 * CDN, rather than Next's optimiser on our server. A GIF is sent as it is,
 * so it keeps moving. Null for anything that is not a public upload — a
 * private file never gets an address outside the app's own route.
 */
function imageKitProps(
  src: string,
  width: number,
  height: number,
  sizes: string | undefined,
): ImgHTMLAttributes<HTMLImageElement> | null {
  if (!imagekitEndpoint()) return null;
  const key = keyFromUrl(src);
  if (!key || !isPublicKey(key)) return null;
  const at = (w: number) => imagekitUrl(key, { width: w, quality: 75 }) ?? src;
  if (key.endsWith(".gif")) {
    return { src: imagekitUrl(key) ?? src, width, height };
  }
  if (sizes) {
    return {
      src: at(1080),
      srcSet: LADDER.map((w) => `${at(w)} ${w}w`).join(", "),
      sizes,
      width,
      height,
    };
  }
  return {
    src: at(width * 2),
    srcSet: `${at(width)} 1x, ${at(width * 2)} 2x`,
    width,
    height,
  };
}
