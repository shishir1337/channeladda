import { isServableKey } from "@/lib/upload-keys";
import { readUpload, UploadError } from "@/server/storage";

/**
 * Serves uploaded files.
 *
 * Uploads live outside `public/` so that requests for them pass through code.
 * Right now that code only sniffs the type and sets safe headers, but proof
 * screenshots and identity documents will need a permission check here, and
 * this is where it goes.
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
      // Keys are random and a file never changes under one, so this is safe.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
