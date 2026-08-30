"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/server/audit";
import { getCurrentUser, requireStaff } from "@/server/session";
import * as repo from "@/server/support";

/**
 * The contact form, and what staff do with what it produces.
 *
 * Submitting deliberately does not require a session. The people who most need
 * to reach support are the ones who cannot sign in.
 */

export type SupportResult =
  | { ok: true; reference: string }
  | { ok: false; error: string };

export async function sendSupportMessage(input: {
  email: string;
  topic: string;
  orderRef: string;
  message: string;
}): Promise<SupportResult> {
  const user = await getCurrentUser();

  const result = await repo.submitTicket({
    userId: user?.id ?? null,
    email: input.email,
    topic: input.topic,
    orderRef: input.orderRef,
    message: input.message,
  });

  if (!result.ok) {
    const errors = {
      email: "Enter an email address we can reply to.",
      message:
        "Tell us a little more — at least a couple of sentences helps us answer properly.",
      topic: "Pick what it is about.",
      rate: "You have just sent us a few messages. Give us a moment to read them.",
    } as const;
    return { ok: false, error: errors[result.reason] };
  }

  revalidatePath("/admin/support");
  // The reference is the part of the id a person can read back over the phone.
  return { ok: true, reference: result.id.slice(-8).toUpperCase() };
}

export type TicketActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function setTicketStatus(
  id: string,
  status: "OPEN" | "ANSWERED" | "CLOSED",
  note: string,
): Promise<TicketActionResult> {
  const staff = await requireStaff();

  const result = await repo.setTicketStatus({
    id,
    status,
    staffId: staff.id,
    note: note.trim() || null,
  });
  if (!result.ok) return { ok: false, error: "That ticket is gone." };

  await recordAudit({
    actorId: staff.id,
    action: `support.${status.toLowerCase()}`,
    entity: "user",
    entityId: id,
  });

  revalidatePath("/admin/support");
  return {
    ok: true,
    message:
      status === "OPEN"
        ? "Back in the queue."
        : status === "ANSWERED"
          ? "Marked as answered."
          : "Closed.",
  };
}
