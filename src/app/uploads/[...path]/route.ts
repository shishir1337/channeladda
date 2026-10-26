import { imagekitUrl } from "@/lib/media";
import {
  cachingFor,
  contentTypeOf,
  isKycKey,
  isPublicKey,
  isServableKey,
} from "@/lib/upload-keys";
import { fetchFromImageKit, onImageKit } from "@/server/imagekit";
import { getCurrentUser } from "@/server/session";
import { hasLocalCopy, readUpload, UploadError } from "@/server/storage";
import { canReadUpload } from "@/server/upload-access";

/**
 * Serves uploaded files.
 *
 * Uploads live outside `public/` so that requests for them pass through code.
 * This is where the permission check lives, which the comment here used to
 * promise and not do: listing artwork is public, but a proof screenshot
 * belongs to the seller who uploaded it and the buyers dealing on that
 * listing, a chat attachment belongs to the two people in the thread, and an
 * ID check's photos and video belong to the member who sent them and the
 * staff who review ID checks — nobody else, staff included.
 *
 * An unguessable name is not a permission. A URL ends up in support tickets,
 * referrer headers and browser history, and none of those should be a way in.
 *
 * Once uploads live on ImageKit this is still the address of every file. A
 * cover or a photo is sent on to ImageKit's CDN; a private file is fetched
 * from ImageKit on a short-lived signed link, after the check, and passed on
 * as ours — so no address that opens it ever reaches the browser.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/uploads/[...path]">,
) {
  const { path } = await params;
  const key = path.join("/");

  // The allowed shapes live in one place, because this route and the chat
  // uploader disagreed about them: this refused the `message/` prefix and
  // every video extension, so every photo and clip sent in a conversation was
  // a 404 while the test suite stayed green.
  if (!isServableKey(key)) {
    return new Response("Not found", { status: 404 });
  }

  // 404 rather than 403 throughout: telling somebody a file exists but is not
  // theirs is information they have no use for and an attacker does.
  const user = await getCurrentUser();
  if (!(await canReadUpload(key, user))) {
    return new Response("Not found", { status: 404 });
  }

  // A file written before the move to ImageKit is still read from disk.
  if (onImageKit() && !(await hasLocalCopy(key))) {
    return fromImageKit(key, request);
  }

  let file: Awaited<ReturnType<typeof readUpload>>;
  try {
    file = await readUpload(key);
  } catch (error) {
    if (error instanceof UploadError) {
      return new Response("Not found", { status: 404 });
    }
    // Missing file, unreadable file — nothing the caller can act on.
    return new Response("Not found", { status: 404 });
  }

  return fromBytes(file.bytes, headersFor(key, file.contentType), request);
}

/** What every file is sent with, whichever store it came from. */
function headersFor(key: string, contentType: string): Record<string, string> {
  return {
    "Content-Type": contentType,
    // The type was decided by reading the file, not by trusting the upload.
    // Tell the browser not to second-guess it.
    "X-Content-Type-Options": "nosniff",
    // Never let one of these render as a page on our own origin.
    "Content-Security-Policy": "default-src 'none'; sandbox",
    ...cachingFor(key),
    "Accept-Ranges": "bytes",
  };
}

/**
 * A file from ImageKit: a public one by its CDN address, a private one
 * fetched here and passed on.
 */
async function fromImageKit(key: string, request: Request): Promise<Response> {
  const cdn = isPublicKey(key) ? imagekitUrl(key) : null;
  if (cdn) {
    // A day, not a year: the address is ImageKit's, and could move.
    return new Response(null, {
      status: 302,
      headers: { Location: cdn, "Cache-Control": "public, max-age=86400" },
    });
  }

  const range = request.headers.get("range");
  let upstream: Response | null;
  try {
    upstream = await fetchFromImageKit(key, range);
  } catch (error) {
    // An ID check's file is not named in a log, even by its key.
    console.error(
      `[uploads] ImageKit could not send ${isKycKey(key) ? "an ID check file" : key}`,
      error,
    );
    return new Response("Could not load the file", { status: 502 });
  }
  if (!upstream) return new Response("Not found", { status: 404 });

  const headers = headersFor(key, contentTypeOf(key));
  // ImageKit sent the whole file to a range request: cut the range here,
  // or Safari will not play the clip.
  if (range && upstream.status === 200) {
    const bytes = Buffer.from(await upstream.arrayBuffer());
    return fromBytes(bytes, headers, request);
  }
  for (const name of ["Content-Length", "Content-Range"]) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

/** A whole file in memory, or the one range of it a video player asked for. */
function fromBytes(
  bytes: Buffer,
  headers: Record<string, string>,
  request: Request,
): Response {
  const size = bytes.byteLength;

  // Safari will not play a video from a server that ignores Range, so a clip
  // in a chat or an ID check's selfie video did not play on an iPhone. One
  // range is all a <video> asks for.
  const range = byteRange(request.headers.get("range"), size);
  if (range === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${size}` },
    });
  }
  if (range) {
    const part = bytes.subarray(range.start, range.end + 1);
    return new Response(new Uint8Array(part), {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(part.byteLength),
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
      },
    });
  }

  return new Response(new Uint8Array(bytes), {
    headers: { ...headers, "Content-Length": String(size) },
  });
}

/**
 * The one byte range a request asks for, or null to send the whole file.
 *
 * Several ranges, or a header that does not parse, get the whole file: that
 * is always a correct answer to a range request. Only a range that starts
 * past the end is refused.
 */
function byteRange(
  header: string | null,
  size: number,
): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, from, to] = match;
  if (from === "" && to === "") return null;

  if (from === "") {
    // The last N bytes.
    const length = Number(to);
    if (length === 0) return "unsatisfiable";
    return { start: Math.max(0, size - length), end: size - 1 };
  }

  const start = Number(from);
  if (start >= size) return "unsatisfiable";
  const end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
  if (end < start) return null;
  return { start, end };
}
