"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  type ProfileErrors,
  type ProfileFields,
  parseProfile,
} from "@/lib/profile";
import { saveProfile } from "@/server/profile";
import { requireUser } from "@/server/session";

export type ProfileResult =
  | { ok: true; message: string }
  | { ok: false; errors: ProfileErrors };

export async function updateProfile(
  fields: ProfileFields,
): Promise<ProfileResult> {
  const user = await requireUser("/dashboard/profile");

  const parsed = parseProfile(fields);
  if (!parsed.ok) return parsed;

  const saved = await saveProfile(user.id, parsed.value);
  if (!saved.ok) return saved;

  // The session keeps the name and photo in a cookie for a minute; read it
  // afresh so the header and menu show the new ones at once.
  await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });

  revalidatePath("/dashboard", "layout");
  if (user.slug) revalidatePath(`/seller/${user.slug}`);
  return { ok: true, message: "Saved." };
}
