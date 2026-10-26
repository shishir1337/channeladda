import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { db } from "@/lib/db";
import {
  deleteFromImageKit,
  onImageKit,
  uploadToImageKit,
} from "@/server/imagekit";

/**
 * Where uploaded files go.
 *
 * This is the seam. Everything else in the app deals in the `StoredFile` that
 * `putUpload` hands back. Once ImageKit is set up (`server/imagekit.ts`) the
 * bytes go there instead of to disk; the key, the URL and every check before
 * them stay exactly as they were. A file written to disk before the move is
 * still read from disk, and copied across by `pnpm media:to-imagekit`.
 *
 * Files are written outside `public/` on purpose. Anything under `public/` is
 * served straight off disk with no code in front of it, which is fine for
 * artwork but wrong for anything that will later need a permission check —
 * proof screenshots and identity documents are coming. Serving through a route
 * handler keeps that door open.
 */

const ROOT = resolve(process.cwd(), ".data", "uploads");

/** 8 MB. Generous for a screenshot, small enough to bound a request. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * 25 MB for a chat clip.
 *
 * Bigger than any image needs to be, because a short screen recording of a
 * dashboard is the most useful thing a seller can send — and asking them to
 * compress it first is how you get a dozen screenshots instead.
 *
 * Raising this means raising client_max_body_size on the proxy to match, or
 * the request is rejected before it reaches this code, with a 413 that
 * explains nothing.
 */
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

/**
 * 50 MB for the selfie video of an ID check.
 *
 * Twice a chat clip, because this one is recorded on a phone's front camera
 * at whatever the phone defaults to — often 1080p — and 30 seconds of that is
 * 30 to 60 MB on a mid-range Android. Telling somebody to change their camera
 * settings is how an optional check stops being taken. The photos of the ID
 * itself stay at MAX_UPLOAD_BYTES.
 *
 * As with chat, the proxy's client_max_body_size has to be at least this
 * plus a megabyte, or the request is refused before it reaches this code.
 */
export const MAX_KYC_VIDEO_BYTES = 50 * 1024 * 1024;

/** The largest any kind allows. The upload route refuses more than this unread. */
export const MAX_ANY_UPLOAD_BYTES = MAX_KYC_VIDEO_BYTES;

/**
 * `kyc` is an ID check: photos of the document and a selfie video. Private —
 * see `canReadUpload`.
 */
export type UploadKind = "cover" | "avatar" | "proof" | "message" | "kyc";

/**
 * The ceiling for a given kind, in bytes. For `kyc` this is the video's;
 * a photo under `kyc` is held to MAX_UPLOAD_BYTES once it is identified.
 */
export function limitFor(kind: UploadKind): number {
  if (kind === "message") return MAX_VIDEO_BYTES;
  if (kind === "kyc") return MAX_KYC_VIDEO_BYTES;
  return MAX_UPLOAD_BYTES;
}

/** Kinds that may be a clip: chat attachments and the ID check's video. */
function takesVideo(kind: UploadKind): boolean {
  return kind === "message" || kind === "kyc";
}

export type StoredFile = {
  /** Relative URL the app should render. */
  url: string;
  /** Opaque handle for deletion. Store this if you need to remove the file. */
  key: string;
  bytes: number;
  contentType: string;
  /**
   * SHA-256 of the file's contents. Stored on proof uploads so the same
   * screenshot turning up under two different sellers is detectable — a
   * strong signal that one of them does not own what they are selling.
   */
  sha256: string;
};

/**
 * Accepted image types, keyed by the bytes a real file of that type starts
 * with.
 *
 * The browser-supplied MIME type is not evidence of anything — it is just a
 * string in the request — so the file is identified by its own contents.
 *
 * SVG is deliberately absent: it is a document format that can carry script,
 * and serving user-supplied SVG from our own origin would be a cross-site
 * scripting hole.
 */
const SIGNATURES: ReadonlyArray<{
  contentType: string;
  ext: string;
  matches: (b: Buffer) => boolean;
}> = [
  {
    contentType: "image/png",
    ext: "png",
    matches: (b) =>
      b.length > 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    contentType: "image/jpeg",
    ext: "jpg",
    matches: (b) =>
      b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    contentType: "image/webp",
    ext: "webp",
    matches: (b) =>
      b.length > 12 &&
      b.subarray(0, 4).toString("latin1") === "RIFF" &&
      b.subarray(8, 12).toString("latin1") === "WEBP",
  },
  {
    contentType: "image/gif",
    ext: "gif",
    matches: (b) =>
      b.length > 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString("latin1")),
  },
  // ---- clips, for chat only ---------------------------------------------
  //
  // An ISO base media file (MP4, M4V, MOV) announces itself with an "ftyp"
  // box four bytes in. The brand that follows says which flavour; they all
  // serve as video/mp4 except QuickTime, which browsers want as
  // video/quicktime.
  {
    contentType: "video/mp4",
    ext: "mp4",
    matches: (b) =>
      b.length > 12 &&
      b.subarray(4, 8).toString("latin1") === "ftyp" &&
      b.subarray(8, 12).toString("latin1") !== "qt  ",
  },
  {
    contentType: "video/quicktime",
    ext: "mov",
    matches: (b) =>
      b.length > 12 &&
      b.subarray(4, 8).toString("latin1") === "ftyp" &&
      b.subarray(8, 12).toString("latin1") === "qt  ",
  },
  {
    // WebM is a Matroska subset; both open with the EBML magic number.
    contentType: "video/webm",
    ext: "webm",
    matches: (b) =>
      b.length > 4 &&
      b[0] === 0x1a &&
      b[1] === 0x45 &&
      b[2] === 0xdf &&
      b[3] === 0xa3,
  },
];

/** Which content types are clips rather than stills. */
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

function isVideo(contentType: string): boolean {
  return VIDEO_TYPES.has(contentType);
}

export class UploadError extends Error {}

function identify(bytes: Buffer, kind: UploadKind) {
  const found = SIGNATURES.find((s) => s.matches(bytes));
  // An ID is a photo: a GIF under `kyc` is refused like any unknown file.
  if (!found || (kind === "kyc" && found.contentType === "image/gif")) {
    throw new UploadError(
      kind === "kyc"
        ? "That is not a photo or a video we can take. Photos: JPEG, PNG or WebP. Videos: MP4, MOV or WebM."
        : kind === "message"
          ? "That file is not an image or a clip we can show. Images: PNG, JPEG, WebP, GIF. Clips: MP4, MOV, WebM."
          : "That file is not a PNG, JPEG, WebP or GIF image. Export it as one and try again.",
    );
  }

  // Clips belong in chat and in an ID check, and nowhere else. A listing
  // cover that is secretly a video breaks every card it appears on, and a
  // proof screenshot is meant to be a screenshot.
  if (isVideo(found.contentType) && !takesVideo(kind)) {
    throw new UploadError("That needs to be an image, not a video.");
  }

  return found;
}

/**
 * Keys are generated, never taken from the upload.
 *
 * A filename that arrives with a request is attacker-controlled: it can carry
 * path separators, a second extension, or a name that collides with someone
 * else's file. None of it is needed, so none of it is kept.
 */
function newKey(kind: UploadKind, ext: string) {
  return `${kind}/${randomBytes(16).toString("hex")}.${ext}`;
}

/** Resolves a key to a path, refusing anything that escapes the upload root. */
function pathFor(key: string) {
  const full = resolve(ROOT, key);
  if (full !== ROOT && !full.startsWith(ROOT + sep)) {
    throw new UploadError("Invalid file reference.");
  }
  return full;
}

export async function putUpload(
  file: File,
  kind: UploadKind,
): Promise<StoredFile> {
  const limit = limitFor(kind);
  const limitMb = limit / 1024 / 1024;

  if (file.size === 0) throw new UploadError("That file is empty.");
  if (file.size > limit) {
    throw new UploadError(
      `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${limitMb}MB.`,
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // Re-check after reading: `file.size` is a claim until the bytes are counted.
  if (bytes.byteLength > limit) {
    throw new UploadError(`That file is larger than the ${limitMb}MB limit.`);
  }

  const { contentType, ext } = identify(bytes, kind);
  // A photo of an ID is held to the image limit: the larger `kyc` ceiling
  // is for the selfie video only.
  if (
    kind === "kyc" &&
    !isVideo(contentType) &&
    bytes.byteLength > MAX_UPLOAD_BYTES
  ) {
    throw new UploadError(
      `That photo is ${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`,
    );
  }
  const key = newKey(kind, ext);
  if (onImageKit()) {
    await uploadToImageKit(key, bytes, contentType);
  } else {
    await mkdir(join(ROOT, kind), { recursive: true });
    await writeFile(pathFor(key), bytes);
  }

  return {
    url: `/uploads/${key}`,
    key,
    bytes: bytes.byteLength,
    contentType,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

/**
 * Whether this file is on the server's own disk: every upload before the
 * move to ImageKit, and every upload while ImageKit is not set up.
 */
export async function hasLocalCopy(key: string): Promise<boolean> {
  try {
    await stat(pathFor(key));
    return true;
  } catch {
    return false;
  }
}

/** A file from the server's own disk. */
export async function readUpload(key: string) {
  const bytes = await readFile(pathFor(key));
  // Keys are written as `kind/hash.ext`, so the kind this file was stored
  // under is in the key itself. It matters because a clip is only a legal
  // upload under `message` and `kyc`, and re-identifying it as anything else
  // here would refuse to serve a file this code wrote.
  const kind = key.split("/")[0] as UploadKind;
  return { bytes, contentType: identify(bytes, kind).contentType };
}

/**
 * Removes a file wherever it is: from disk, and from ImageKit when that is
 * set up. Throws if ImageKit cannot be reached, so a sweep keeps its row and
 * tries again rather than forgetting a file that is still there.
 */
export async function deleteUpload(key: string) {
  await unlink(pathFor(key)).catch(() => {
    // Already gone is the outcome we wanted.
  });
  if (onImageKit()) await deleteFromImageKit(key);
}

/**
 * How big a stored file is, for recording against the message that carries it.
 *
 * Read from disk rather than taken from the client: the uploader used to send
 * its own byte count, which made the 25MB ceiling advisory and the column
 * useless for accounting. A file on ImageKit is sized from its upload
 * record, which the upload route wrote from the bytes it counted. Returns
 * null when the file has gone, which is not an error — the row is still
 * worth writing.
 */
export async function sizeOfUpload(key: string): Promise<number | null> {
  try {
    const { size } = await stat(pathFor(key));
    return size;
  } catch {
    if (!onImageKit()) return null;
    const upload = await db.upload.findUnique({
      where: { key },
      select: { bytes: true },
    });
    return upload?.bytes ?? null;
  }
}
