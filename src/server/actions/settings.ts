"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/server/audit";
import { requireSuperadmin } from "@/server/session";
import { type SettingsInput, updateSettings } from "@/server/settings";

export type SettingsResult =
  | { ok: true; message: string }
  | { ok: false; errors: Record<string, string> };

/**
 * Changing the fees.
 *
 * SUPERADMIN only — not moderators, not finance. This changes what every
 * future sale costs, which is a different kind of decision from approving a
 * listing or approving a payout.
 */
export async function saveSettings(
  input: SettingsInput,
): Promise<SettingsResult> {
  const actor = await requireSuperadmin();

  const result = await updateSettings(input, actor.id);
  if (!result.ok) {
    const errors: Record<string, string> = {};
    for (const error of result.errors) errors[error.field] = error.message;
    return { ok: false, errors };
  }

  await recordAudit({
    actorId: actor.id,
    action: "settings.update",
    entity: "user",
    entityId: "platform-settings",
    before: result.before,
    after: result.after,
  });

  // Every page that quotes a price is now out of date.
  for (const path of ["/fees", "/sell", "/admin/settings"]) {
    revalidatePath(path);
  }
  revalidatePath("/listing/[slug]", "page");
  revalidatePath("/dashboard/listings/[id]", "page");

  return { ok: true, message: "Saved. New sales use these rates from now on." };
}
