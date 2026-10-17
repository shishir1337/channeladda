"use server";

import { revalidatePath } from "next/cache";
import { markAllRead, markRead } from "@/server/notifications";
import { requireUser } from "@/server/session";

/**
 * Marking notifications read.
 *
 * Both are scoped to the caller inside the repository, not here: passing an id
 * that belongs to somebody else matches nothing rather than reading their
 * notification for them.
 */
export async function readOne(id: string): Promise<void> {
  const user = await requireUser();
  await markRead(id, user.id);
  revalidatePath("/dashboard", "layout");
}

export async function readAll(): Promise<void> {
  const user = await requireUser();
  await markAllRead(user.id);
  revalidatePath("/dashboard", "layout");
}
