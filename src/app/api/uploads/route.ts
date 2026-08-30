import { getCurrentUser } from "@/server/session";
import { MAX_UPLOAD_BYTES, putUpload, UploadError } from "@/server/storage";

/**
 * Accepts one image.
 *
 * A route handler rather than a Server Action: actions are capped at a 1MB
 * request body, and raising `serverActions.bodySizeLimit` to clear that would
 * raise it for every action in the app, not just this one. Actions also
 * dispatch one at a time per client, so a gallery of screenshots would upload
 * in single file.
 */
const KINDS = new Set(["cover", "avatar", "proof"]);

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

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES * 1.1) {
    return Response.json(
      { error: "That file is larger than the 8MB limit." },
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

  const kind = String(form.get("kind") ?? "");
  if (!KINDS.has(kind)) {
    return Response.json({ error: "Unknown upload type." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file was attached." }, { status: 400 });
  }

  try {
    const stored = await putUpload(file, kind as "cover" | "avatar" | "proof");
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
