import "server-only";

import { db } from "@/lib/db";
import type { ProfileErrors, ProfileValues } from "@/lib/profile";
import { keyFromUrl } from "@/lib/upload-keys";

/**
 * Saves what a member says about themselves, already checked by
 * `parseProfile`.
 *
 * The photo is the one thing taken on trust from the form, so it is checked
 * against the uploads: one this member sent as a profile photo, or the one
 * already on their profile. Anything else would let somebody wear another
 * member's face.
 */
export async function saveProfile(
  userId: string,
  values: ProfileValues,
): Promise<{ ok: true } | { ok: false; errors: ProfileErrors }> {
  if (values.image) {
    const current = await db.user.findUnique({
      where: { id: userId },
      select: { image: true },
    });
    if (current?.image !== values.image) {
      const key = keyFromUrl(values.image);
      const upload = key
        ? await db.upload.findUnique({
            where: { key },
            select: { uploaderId: true, kind: true },
          })
        : null;
      if (upload?.uploaderId !== userId || upload.kind !== "avatar") {
        return { ok: false, errors: { image: "Choose your photo again." } };
      }
    }
  }

  await db.user.update({
    where: { id: userId },
    data: {
      name: values.name,
      country: values.country,
      image: values.image,
      bio: values.bio,
    },
  });
  return { ok: true };
}
