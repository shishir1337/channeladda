import "server-only";

import { db } from "@/lib/db";
import { MAX_SUPPORT_MESSAGE, SUPPORT_TOPICS } from "@/lib/support";

/**
 * Support tickets.
 *
 * The form this feeds used to say "Message sent" and send nothing. That is
 * worse than having no form: a buyer watching a scam unfold thinks help is
 * coming. Everything here exists so that message is true and a moderator can
 * actually see what arrived.
 */

export type SubmitResult =
  | { ok: true; id: string }
  | { ok: false; reason: "email" | "message" | "topic" | "rate" };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitTicket(input: {
  userId: string | null;
  email: string;
  topic: string;
  orderRef: string | null;
  message: string;
}): Promise<SubmitResult> {
  const email = input.email.trim().toLowerCase();
  const message = input.message.trim();

  if (!EMAIL.test(email)) return { ok: false, reason: "email" };
  if (message.length < 20 || message.length > MAX_SUPPORT_MESSAGE) {
    return { ok: false, reason: "message" };
  }
  if (!SUPPORT_TOPICS.includes(input.topic as never)) {
    return { ok: false, reason: "topic" };
  }

  // One address cannot fill the queue. Anyone with a real problem sends one
  // message and waits; five in a minute is either a mistake or a flood.
  const recent = await db.supportTicket.count({
    where: { email, createdAt: { gt: new Date(Date.now() - 60_000) } },
  });
  if (recent >= 3) return { ok: false, reason: "rate" };

  const ticket = await db.supportTicket.create({
    data: {
      userId: input.userId,
      email,
      topic: input.topic,
      orderRef: input.orderRef?.trim() || null,
      message,
    },
    select: { id: true },
  });
  return { ok: true, id: ticket.id };
}

export type TicketRow = {
  id: string;
  email: string;
  topic: string;
  orderRef: string | null;
  message: string;
  status: "OPEN" | "ANSWERED" | "CLOSED";
  createdAt: Date;
  fromName: string | null;
  fromId: string | null;
  handledBy: string | null;
  staffNote: string | null;
};

export async function listTickets(
  status?: "OPEN" | "ANSWERED" | "CLOSED",
  take = 50,
): Promise<TicketRow[]> {
  const rows = await db.supportTicket.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      email: true,
      topic: true,
      orderRef: true,
      message: true,
      status: true,
      staffNote: true,
      createdAt: true,
      user: { select: { id: true, name: true } },
      handledBy: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    topic: row.topic,
    orderRef: row.orderRef,
    message: row.message,
    status: row.status,
    createdAt: row.createdAt,
    fromName: row.user?.name ?? null,
    fromId: row.user?.id ?? null,
    handledBy: row.handledBy?.name ?? null,
    staffNote: row.staffNote,
  }));
}

export async function countOpenTickets(): Promise<number> {
  return db.supportTicket.count({ where: { status: "OPEN" } });
}

export async function setTicketStatus(input: {
  id: string;
  status: "OPEN" | "ANSWERED" | "CLOSED";
  staffId: string;
  note: string | null;
}) {
  const updated = await db.supportTicket.updateMany({
    where: { id: input.id },
    data: {
      status: input.status,
      handledById: input.status === "OPEN" ? null : input.staffId,
      handledAt: input.status === "OPEN" ? null : new Date(),
      ...(input.note !== null ? { staffNote: input.note } : {}),
    },
  });
  return { ok: updated.count === 1 };
}
