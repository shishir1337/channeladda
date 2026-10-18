import "server-only";

import { db } from "@/lib/db";
import { MAX_UPLOAD_BYTES, putUpload } from "@/server/storage";

/**
 * Copying a channel's own picture and banner into the listing.
 *
 * Linking to Google's or Telegram's copy would work until the day the channel
 * changes its picture, and then every card the listing appears on would show
 * a broken image. So the file is fetched once, at lookup, and stored exactly
 * like one the seller uploaded: identified by its bytes, kept under a key we
 * generate, and recorded against the seller so an unused one is swept away.
 *
 * Only the platforms' own image hosts are ever fetched. The URL comes from
 * the platform's answer rather than from the seller, but the check is here
 * too, so this can never become a way to make the server fetch anything else.
 */
const ALLOWED_HOSTS = [
  /^yt3\.googleusercontent\.com$/,
  /^yt3\.ggpht\.com$/,
  /^cdn\d+\.telesco\.pe$/,
];

export function isAllowedRemoteImage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.port === "" &&
      ALLOWED_HOSTS.some((host) => host.test(parsed.hostname))
    );
  } catch {
    return false;
  }
}

/**
 * The stored file's URL, or null when it could not be copied — in which case
 * the seller simply uploads one, as they would have anyway.
 */
export async function storeRemoteImage(
  url: string | null,
  kind: "avatar" | "cover",
  uploaderId: string,
): Promise<string | null> {
  if (!url || !isAllowedRemoteImage(url)) return null;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      // A redirect could lead anywhere; these hosts never need one.
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;

    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_UPLOAD_BYTES) return null;

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_UPLOAD_BYTES) {
      return null;
    }

    // putUpload decides what the file is from its bytes, whatever the
    // response claimed, and refuses anything that is not a still image.
    const stored = await putUpload(
      new File([bytes], `${kind}`, {
        type: response.headers.get("content-type") ?? "",
      }),
      kind,
    );
    await db.upload.create({
      data: {
        key: stored.key,
        uploaderId,
        kind,
        bytes: stored.bytes,
        contentType: stored.contentType,
      },
    });
    return stored.url;
  } catch (error) {
    console.error("[remote-image]", kind, error);
    return null;
  }
}
