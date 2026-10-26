/**
 * The photo on a Google account, as Google sign-in hands it over.
 *
 * It arrives in the ID token Google gave the server at sign-in, over TLS and
 * from Google itself, so the token is read here and not verified again. The
 * address is checked all the same: only Google's own photo host is taken,
 * because the server fetches whatever this returns.
 */
const PHOTO_HOST = /^lh\d\.googleusercontent\.com$/;

/** Google draws the photo at 96 pixels; 256 stays sharp on a profile page. */
const SIZE = /=s\d+(-c)?$/;

export function isGooglePhotoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.port === "" &&
      PHOTO_HOST.test(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function googlePhotoFromIdToken(
  idToken: string | null | undefined,
): string | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const { picture } = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { picture?: unknown };
    if (typeof picture !== "string" || !isGooglePhotoUrl(picture)) return null;
    return picture.replace(SIZE, "=s256-c");
  } catch {
    return null;
  }
}
