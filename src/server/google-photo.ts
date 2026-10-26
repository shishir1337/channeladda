import "server-only";

import { db } from "@/lib/db";
import { googlePhotoFromIdToken } from "@/lib/google-photo";
import { keyFromUrl } from "@/lib/upload-keys";
import { storeRemoteImage } from "@/server/remote-image";
import { markUploadsAttached } from "@/server/upload-access";

/**
 * Gives a member who signs in with Google their Google photo, as a copy of
 * our own.
 *
 * Better Auth sets the photo only on an account it creates, and then as a
 * link to Google's copy — which the profile form refuses and which breaks
 * the day the member changes their Google photo. An account that already
 * existed, made with a password, is joined to Google without the photo at
 * all. So on every Google sign-in, a member with no photo of their own gets
 * the Google one, fetched once and stored like an upload.
 *
 * A photo the member chose is never replaced, and a failure to fetch leaves
 * the profile as it was: sign-in never waits on this going right.
 */
export async function adoptGooglePhoto(
  userId: string,
  idToken: string | null | undefined,
): Promise<void> {
  const picture = googlePhotoFromIdToken(idToken);
  if (!picture) return;

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { image: true },
    });
    if (!user || (user.image && keyFromUrl(user.image))) return;

    const stored = await storeRemoteImage(picture, "avatar", userId);
    if (!stored) return;

    // Only if the photo is still the one read above: a member who uploaded
    // their own in the meantime keeps it.
    const { count } = await db.user.updateMany({
      where: { id: userId, image: user.image },
      data: { image: stored },
    });
    if (count > 0) await markUploadsAttached([stored]);
  } catch (error) {
    console.error("[google-photo]", error);
  }
}
