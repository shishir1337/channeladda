import "server-only";

import ImageKit, { toFile } from "@imagekit/nodejs";
import { imagekitEndpoint, mediaFolder, mediaPath } from "@/lib/media";
import { isPublicKey } from "@/lib/upload-keys";

/**
 * Uploaded files on ImageKit, rather than on the server's own disk.
 *
 * A file still comes through our upload route first: its bytes are
 * identified there, its size is checked against its kind, and it is
 * recorded against the member who sent it. Only then is it sent here — so
 * nothing reaches ImageKit that the route would have refused.
 *
 * Covers and profile photos are public files, drawn straight from
 * ImageKit's CDN. Proof screenshots, chat files and ID checks are private
 * files: ImageKit serves them only on a signed link, and only our own
 * `/uploads` route asks for one, after its permission check. A link copied
 * out of the page is ours, not ImageKit's, so it is never a way in.
 */

/** Whether uploads go to ImageKit: once its endpoint is set. */
export function onImageKit(): boolean {
  return imagekitEndpoint() !== null;
}

let cached: { privateKey: string; client: ImageKit } | null = null;

function client(): ImageKit {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY?.trim();
  if (!privateKey) {
    throw new Error(
      "IMAGEKIT_PRIVATE_KEY is not set, though NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT is: uploaded files cannot be stored or read.",
    );
  }
  if (cached?.privateKey !== privateKey) {
    cached = {
      privateKey,
      client: new ImageKit({
        privateKey,
        // Through whatever `fetch` is current, rather than the one there
        // was when the client was made.
        fetch: (input, init) => globalThis.fetch(input, init),
      }),
    };
  }
  return cached.client;
}

function endpoint(): string {
  const url = imagekitEndpoint();
  if (!url) throw new Error("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT is not set.");
  return url;
}

/** "cover/<hex>.png" as ImageKit's folder and file name. */
function place(key: string): { folder: string; name: string } {
  const slash = key.indexOf("/");
  return {
    folder: `/${mediaFolder()}/${key.slice(0, slash)}`,
    name: key.slice(slash + 1),
  };
}

/**
 * Stores a file under its own key: never renamed, never written over.
 *
 * The key is the file's name everywhere in the app, so a copy ImageKit
 * renamed would be a file nothing could find. It is checked on the way back.
 */
export async function uploadToImageKit(
  key: string,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  const { folder, name } = place(key);
  const result = await client().files.upload({
    file: await toFile(bytes, name, { type: contentType }),
    fileName: name,
    folder,
    useUniqueFileName: false,
    overwriteFile: false,
    isPrivateFile: !isPublicKey(key),
  });
  if (result.filePath !== mediaPath(key)) {
    // No key in the message: an ID check's file is never named in a log.
    throw new Error(
      "ImageKit stored an upload somewhere not where it was sent.",
    );
  }
}

/** The file ImageKit holds under this key, or null. */
export async function findOnImageKit(
  key: string,
): Promise<{ fileId: string } | null> {
  const { folder, name } = place(key);
  const found = await client().assets.list({
    path: folder,
    searchQuery: `name = "${name}"`,
    limit: 10,
  });
  for (const item of found) {
    if ("fileId" in item && item.fileId && item.filePath === mediaPath(key)) {
      return { fileId: item.fileId };
    }
  }
  return null;
}

/**
 * Removes the file under this key. Already gone is the outcome we wanted.
 *
 * Found by ImageKit's search, which takes a little while — half a minute or
 * so — to see a new file. Every sweep that deletes runs hours after the
 * upload; a file deleted the moment it is stored may be missed.
 */
export async function deleteFromImageKit(key: string): Promise<void> {
  const file = await findOnImageKit(key);
  if (file) await client().files.delete(file.fileId);
}

/**
 * Deletes the site's whole folder on ImageKit, every upload in it: for a
 * reset of all data, nothing else. A folder that is not there is the
 * outcome wanted.
 */
export async function deleteFolderFromImageKit(): Promise<void> {
  try {
    await client().folders.delete({ folderPath: `/${mediaFolder()}` });
  } catch (error) {
    if (error instanceof ImageKit.NotFoundError) return;
    throw error;
  }
}

/**
 * A link to the file's original bytes that works for `seconds` and is then
 * refused: what our route fetches a private file through.
 *
 * `orig-true` asks for the file exactly as it was sent. Without it ImageKit
 * may hand a PNG back as WebP to a browser that takes WebP, and the type our
 * route sends — decided from the key, which was decided from the bytes —
 * would no longer be true.
 */
export function signedOriginalUrl(key: string, seconds = 300): string {
  return client().helper.buildSrc({
    urlEndpoint: endpoint(),
    src: mediaPath(key),
    transformation: [{ original: true }],
    signed: true,
    expiresIn: seconds,
  });
}

/**
 * A private file's bytes, for our route to pass on: the range a video
 * player asked for, or all of it. Null when ImageKit has no such file.
 */
export async function fetchFromImageKit(
  key: string,
  range: string | null,
): Promise<Response | null> {
  const response = await fetch(signedOriginalUrl(key), {
    headers: range ? { Range: range } : undefined,
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok && response.status !== 416) {
    throw new Error(`ImageKit answered ${response.status} for an upload.`);
  }
  return response;
}
