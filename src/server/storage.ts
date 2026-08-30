import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

/**
 * Where uploaded files go.
 *
 * This is the seam. Everything else in the app deals in the `StoredFile` that
 * `putUpload` hands back, so moving to ImageKit later means rewriting this file
 * and nothing else.
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

export type UploadKind = "cover" | "avatar" | "proof";

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
];

export class UploadError extends Error {}

function identify(bytes: Buffer) {
  const found = SIGNATURES.find((s) => s.matches(bytes));
  if (!found) {
    throw new UploadError(
      "That file is not a PNG, JPEG, WebP or GIF image. Export it as one and try again.",
    );
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
  if (file.size === 0) throw new UploadError("That file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`,
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // Re-check after reading: `file.size` is a claim until the bytes are counted.
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new UploadError("That file is larger than the 8MB limit.");
  }

  const { contentType, ext } = identify(bytes);
  const key = newKey(kind, ext);
  const target = pathFor(key);

  await mkdir(join(ROOT, kind), { recursive: true });
  await writeFile(target, bytes);

  return {
    url: `/uploads/${key}`,
    key,
    bytes: bytes.byteLength,
    contentType,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function readUpload(key: string) {
  const bytes = await readFile(pathFor(key));
  return { bytes, contentType: identify(bytes).contentType };
}

export async function deleteUpload(key: string) {
  await unlink(pathFor(key)).catch(() => {
    // Already gone is the outcome we wanted.
  });
}
