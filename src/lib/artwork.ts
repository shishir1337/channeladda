import { getImageProps } from "next/image";
import type { ImgHTMLAttributes } from "react";
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
 * sharp one.
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
