import "server-only";

import type { NotificationKind } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { emailAction } from "@/lib/email-layout";
import { siteUrl } from "@/lib/site-url";
import { canSendMail, sendMail } from "@/server/mailer";

/**
 * Telling somebody something happened.
 *
 * The `Notification` table has existed since the first migration and exactly
 * one thing wrote to it — deal turn-taking — while nothing at all read it. So
 * an offer, a message, a listing decision, a payout and a dispute all passed
 * in silence, and the rows that did get written were invisible.
 *
 * Two rules hold everything here together:
 *
 * 1. **A notification must never break what caused it.** A sent message, an
 *    accepted offer or a completed deal step has already happened by the time
 *    this runs. Everything is caught and logged.
 * 2. **Interrupt sparingly.** A row in the bell is cheap; an email is not.
 *    Only things that stall if ignored — your turn on a deal, an offer on your
 *    listing, a rejected listing, a settled payout, a dispute — are worth one.
 *    Chat is not: it arrives in bursts and the bell is the right place for it.
 */
export type NotifyInput = {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href?: string;
  /**
   * Fold repeats into one unread row.
   *
   * Ten lines in one thread should say "you have something to read in here",
   * and it stops saying that the moment the bell shows 10. The newest body
   * wins, so the collapsed row is the latest news rather than the oldest.
   * Once read, the next one starts a fresh row.
   */
  collapseKey?: string;
  /** Send an email as well. Off by default — see rule 2. */
  email?: { subject: string; body: string; link?: string; action?: string };
};

export async function notify(input: NotifyInput): Promise<void> {
  try {
    if (input.collapseKey) {
      const existing = await db.notification.findFirst({
        where: {
          userId: input.userId,
          readAt: null,
          // The key is carried in href, which is where the row points anyway:
          // one unread row per conversation, per listing, per deal.
          href: input.href ?? null,
          kind: input.kind,
        },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      });

      if (existing) {
        await db.notification.update({
          where: { id: existing.id },
          data: {
            title: input.title,
            body: input.body,
            createdAt: new Date(),
          },
        });
        return;
      }
    }

    await db.notification.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        href: input.href ?? null,
      },
    });

    if (input.email && canSendMail()) {
      const person = await db.user.findUnique({
        where: { id: input.userId },
        select: { email: true },
      });
      if (person?.email) {
        // The button goes where the notification does, unless the caller
        // chose a link of its own.
        const href = input.href;
        await sendMail({
          to: person.email,
          ...input.email,
          link:
            input.email.link ??
            (href
              ? /^https?:/.test(href)
                ? href
                : `${siteUrl()}${href}`
              : undefined),
          action:
            input.email.action ??
            (!input.email.link && href ? emailAction(href) : undefined),
        });
      }
    }
  } catch (error) {
    console.error(`[notify] ${input.kind} for ${input.userId}`, error);
  }
}

/** Several people, one event. Each one is independent — see rule 1. */
export async function notifyAll(
  userIds: readonly (string | null | undefined)[],
  build: (userId: string) => NotifyInput,
): Promise<void> {
  const unique = [
    ...new Set(userIds.filter((id): id is string => Boolean(id))),
  ];
  await Promise.all(unique.map((id) => notify(build(id))));
}

export type NotificationView = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export async function listNotifications(
  userId: string,
  limit = 30,
): Promise<NotificationView[]> {
  return db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      kind: true,
      title: true,
      body: true,
      href: true,
      readAt: true,
      createdAt: true,
    },
  });
}

/**
 * How many are waiting.
 *
 * Read on every dashboard page to draw the bell, so it is a count against
 * `@@index([userId, readAt])` and nothing more.
 */
export async function unreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}

/**
 * The newest few unread, for the chime (`/api/notifications/pulse`).
 *
 * Every open tab asks for this every 15 seconds, so it reads the same index
 * as `unreadCount` and only the columns the browser needs to tell new from
 * old. Time, not id, is what tells them apart: a collapsed row (see
 * `collapseKey`) keeps its id and moves its time forward, and the tenth line
 * in a thread is news too.
 */
export async function latestUnread(
  userId: string,
  take = 5,
): Promise<
  { id: string; kind: NotificationKind; href: string | null; createdAt: Date }[]
> {
  return db.notification.findMany({
    where: { userId, readAt: null },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, kind: true, href: true, createdAt: true },
  });
}

/**
 * Scoped to the owner, always.
 *
 * `updateMany` rather than `update` so an id that belongs to somebody else
 * matches nothing instead of throwing — and, more to the point, instead of
 * marking their notification read.
 */
export async function markRead(id: string, userId: string): Promise<void> {
  await db.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllRead(userId: string): Promise<void> {
  await db.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

/**
 * Everyone at a desk.
 *
 * The bell reached buyers and sellers, and nothing told the people who have
 * to act: a payout sat held against a seller's balance until somebody
 * happened to open the queue, and a dispute waited for a moderator to
 * notice a red row. SUPERADMIN is always included — they own every desk.
 * Suspended staff are not.
 */
export async function notifyStaff(
  roles: readonly ("MODERATOR" | "FINANCE")[],
  build: (userId: string) => NotifyInput,
): Promise<void> {
  try {
    const staff = await db.user.findMany({
      where: {
        role: { in: [...roles, "SUPERADMIN"] },
        bannedAt: null,
      },
      select: { id: true },
    });
    await notifyAll(
      staff.map((s) => s.id),
      build,
    );
  } catch (error) {
    console.error("[notify] staff", error);
  }
}
