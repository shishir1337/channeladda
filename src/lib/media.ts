/**
 * Where uploaded files are delivered from once they live on ImageKit.
 *
 * A file keeps the app's own name for it — `cover/<32 hex>.png`, stored on
 * the rows that point at it as `/uploads/cover/<32 hex>.png` — wherever its
 * bytes are. Every permission check, every sweep and every form reads that
 * name, so moving the bytes to ImageKit changed none of them; this turns
 * the name into ImageKit's address.
 *
 * Read in the browser as well as on the server, to draw a listing card:
 * hence `NEXT_PUBLIC_`. Neither value is a secret. The private key, which
 * is, is read only in `server/imagekit.ts`.
 */

/** "https://ik.imagekit.io/channeladda", or null while files stay on disk. */
export function imagekitEndpoint(): string | null {
  const raw = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT?.trim();
  return raw ? raw.replace(/\/+$/, "") : null;
}

/**
 * The ImageKit folder every upload goes under. "uploads" on the live site;
 * a copy run on a laptop sets its own, so its test files never sit beside
 * real ones.
 */
export function mediaFolder(): string {
  const raw = process.env.NEXT_PUBLIC_IMAGEKIT_FOLDER?.trim().replace(
    /^\/+|\/+$/g,
    "",
  );
  return raw || "uploads";
}

/** A key's path on ImageKit: "/uploads/cover/<hex>.png". */
export function mediaPath(key: string): string {
  return `/${mediaFolder()}/${key}`;
}

/**
 * A public upload's ImageKit address — a cover or a profile photo — with a
 * resize when given a width. Null while ImageKit is not set up.
 *
 * Never for a proof, a chat file or an ID photo: those are private files on
 * ImageKit, and only the app's own route may fetch them, after its
 * permission check.
 */
export function imagekitUrl(
  key: string,
  transform?: { width?: number; quality?: number },
): string | null {
  const endpoint = imagekitEndpoint();
  if (!endpoint) return null;
  const steps = [
    transform?.width ? `w-${Math.round(transform.width)}` : null,
    transform?.quality ? `q-${transform.quality}` : null,
  ].filter(Boolean);
  return `${endpoint}${mediaPath(key)}${steps.length ? `?tr=${steps.join(",")}` : ""}`;
}
