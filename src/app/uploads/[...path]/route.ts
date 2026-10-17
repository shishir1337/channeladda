import { isServableKey } from "@/lib/upload-keys";
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
 * listing, and a chat attachment belongs to the two people in the thread.
 *
 * An unguessable name is not a permission. A URL ends up in support tickets,
 * referrer headers and browser history, and none of those should be a way in.
 */
export async function GET(
  _request: Request,
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

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.bytes.byteLength),
      // The type was decided by reading the file, not by trusting the upload.
      // Tell the browser not to second-guess it.
      "X-Content-Type-Options": "nosniff",
      // Never let one of these render as a page on our own origin.
      "Content-Security-Policy": "default-src 'none'; sandbox",
      // Private, not public: these bytes are permission-gated, and the day
      // a CDN or a caching proxy is put in front of this route a shared
      // cache entry would serve one person's screenshot to the next
      // requester. A file never changes under a key, so the browser's own
      // cache can still hold it for a year.
      "Cache-Control": "private, max-age=31536000, immutable",
      Vary: "Cookie",
    },
  });
}
