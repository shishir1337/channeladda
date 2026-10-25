import { isKycKey, isServableKey } from "@/lib/upload-keys";
import { getCurrentUser } from "@/server/session";
import { readUpload, UploadError } from "@/server/storage";
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

  const size = file.bytes.byteLength;
  const headers: Record<string, string> = {
    "Content-Type": file.contentType,
    // The type was decided by reading the file, not by trusting the upload.
    // Tell the browser not to second-guess it.
    "X-Content-Type-Options": "nosniff",
    // Never let one of these render as a page on our own origin.
    "Content-Security-Policy": "default-src 'none'; sandbox",
    // Private, not public: these bytes are permission-gated, and the day
    // a CDN or a caching proxy is put in front of this route a shared
    // cache entry would serve one person's screenshot to the next
    // requester. A file never changes under a key, so the browser's own
    // cache can still hold it for a year — except an ID check's, which is
    // not written to the disk of whatever computer staff reviewed it on.
    "Cache-Control": isKycKey(key)
      ? "private, no-store"
      : "private, max-age=31536000, immutable",
    Vary: "Cookie",
    "Accept-Ranges": "bytes",
  };

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
    const part = file.bytes.subarray(range.start, range.end + 1);
    return new Response(new Uint8Array(part), {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(part.byteLength),
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
      },
    });
  }

  return new Response(new Uint8Array(file.bytes), {
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
