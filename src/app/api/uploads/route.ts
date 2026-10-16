import { db } from "@/lib/db";
import { getCurrentUser } from "@/server/session";
import {
  limitFor,
  MAX_VIDEO_BYTES,
  putUpload,
  UploadError,
  type UploadKind,
} from "@/server/storage";

/**
 * Accepts one image.
 *
 * A route handler rather than a Server Action: actions are capped at a 1MB
 * request body, and raising `serverActions.bodySizeLimit` to clear that would
 * raise it for every action in the app, not just this one. Actions also
 * dispatch one at a time per client, so a gallery of screenshots would upload
 * in single file.
 */
const KINDS = new Set<UploadKind>(["cover", "avatar", "proof", "message"]);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { error: "Sign in to upload files." },
      { status: 401 },
    );
  }
  if (user.banned) {
    return Response.json(
      { error: "This account is suspended." },
      { status: 403 },
    );
  }

  // Refused before the body is read. `request.formData()` buffers and parses
  // the whole multipart payload into memory, so a size check after it — which
  // is where this used to be — means a 2GB POST is fully buffered before
  // anyone is told no. The ceiling here is the largest any kind allows plus
  // room for multipart framing; the per-kind limit is applied once the kind
  // is known.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_VIDEO_BYTES + 1024 * 1024) {
    return Response.json(
      {
        error: `That file is ${(declared / 1024 / 1024).toFixed(1)}MB. The limit is ${MAX_VIDEO_BYTES / 1024 / 1024}MB.`,
      },
      { status: 413 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: "That upload was malformed." },
      { status: 400 },
    );
  }

  const kind = String(form.get("kind") ?? "") as UploadKind;
  if (!KINDS.has(kind)) {
    return Response.json({ error: "Unknown upload type." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file was attached." }, { status: 400 });
  }

  // Checked after the kind is known, because a chat clip is allowed to be
  // three times the size of a listing image. The headroom is for multipart
  // framing, which adds a little to the declared length.
  const limit = limitFor(kind);
  if (file.size > limit) {
    return Response.json(
      {
        error: `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${limit / 1024 / 1024}MB.`,
      },
      { status: 413 },
    );
  }

  try {
    const stored = await putUpload(file, kind);

    // Recorded so the uploader can read their own file before anything else
    // references it, and so an upload nobody ever attaches can be collected.
    await db.upload.create({
      data: {
        key: stored.key,
        uploaderId: user.id,
        kind,
        bytes: stored.bytes,
        contentType: stored.contentType,
      },
    });

    return Response.json({
      url: stored.url,
      key: stored.key,
      bytes: stored.bytes,
      contentType: stored.contentType,
      sha256: stored.sha256,
    });
  } catch (error) {
    if (error instanceof UploadError) {
      // These messages are written for the person who picked the file.
      return Response.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}
