import "server-only";

import { db } from "@/lib/db";
import { TERMINAL_STATUSES } from "@/lib/deal-machine";
import { isChatAttachmentKey, keyFromUrl } from "@/lib/upload-keys";
import { deleteUpload } from "@/server/storage";

/**
 * How long chat keeps things.
 *
 * Two different clocks, for two different reasons.
 *
 * **Attachments go after 48 hours.** A marketplace chat fills up with
 * screenshots of analytics dashboards, payout pages and — whatever the rules
 * say — identity documents. They are useful for about a day and a liability
 * for ever. The message that carried one survives; only the file is deleted.
 *
 * **Messages go after 10 days, unless the thread is part of the record.** The
 * owner asked for chat to clear "without the deal part", and the carve-outs
 * are wider than that phrase, because each of them is something somebody will
 * one day need to prove:
 *
 * - a thread tied to an order, which is the only account of what was agreed
 * - a thread tied to an order with a dispute open on it
 * - a thread staff flagged, which is evidence about a person rather than a deal
 * - any message staff wrote, which they wrote to be found later
 *
 * Both sweeps are idempotent and safe to run concurrently, because both
 * filter on the state they are about to change.
 */

/** 48 hours, as a duration to stamp onto a new upload. */
export const MEDIA_TTL_MS = 48 * 60 * 60 * 1000;

/** 10 days. */
const MESSAGE_TTL_MS = 10 * 24 * 60 * 60 * 1000;

/** When an attachment uploaded now should be deleted. */
export function mediaExpiryFrom(now = new Date()): Date {
  return new Date(now.getTime() + MEDIA_TTL_MS);
}

/**
 * Deletes expired attachment files and forgets their URLs.
 *
 * Not while the deal a thread belongs to is still live, and never in a thread
 * staff flagged: see the query for why the two rules meet where they do.
 *
 * The row is updated after the file is gone, not before: if deletion fails the
 * sweep leaves the row alone and tries again next time, rather than pointing
 * the UI at a file that is still on disk with nothing referencing it.
 */
export async function purgeExpiredMedia(now = new Date()): Promise<number> {
  const due = await db.message.findMany({
    where: {
      attachmentUrl: { not: null },
      attachmentRemovedAt: null,
      attachmentExpiresAt: { lte: now },
      // Two rules meet here. The owner asked for media to go after 48 hours
      // — nobody's screenshots hoarded, a deal's no more than a question's.
      // But a receipt posted in a deal thread is the evidence a dispute is
      // decided on, and 48 hours is shorter than every other clock it has to
      // survive, two seven-day Google holds among them: a receipt from day 0
      // was gone by the dispute on day 4.
      //
      // So a deal thread's media waits for the deal to end — exactly as long
      // as a dispute can still be raised — and then the normal clock takes
      // it. A thread staff flagged keeps its media: that is evidence about a
      // person, not a deal.
      //
      // A conversation can hold several deals — one lapses, the buyer opens
      // another — so it waits for every one of them, not just the first.
      conversation: {
        flaggedAt: null,
        orders: { none: { status: { notIn: [...TERMINAL_STATUSES] } } },
      },
    },
    select: { id: true, attachmentUrl: true },
    take: 500,
  });

  let removed = 0;
  for (const message of due) {
    if (!message.attachmentUrl) continue;

    // Only ever a chat attachment. Rows written before the send path
    // validated its input could name any public file — a listing cover, or
    // somebody else's proof screenshot — and this sweep would have unlinked
    // it. Such a row still gets cleared, so it stops being rendered; no file
    // outside `message/` is touched.
    const key = keyFromUrl(message.attachmentUrl);
    if (key && isChatAttachmentKey(key)) {
      try {
        await deleteUpload(key);
      } catch (error) {
        // A file already gone is fine — the row still needs clearing.
        console.error(`[chat-retention] could not delete ${key}`, error);
      }
    } else {
      console.warn(
        `[chat-retention] not deleting ${message.attachmentUrl}: not a chat attachment`,
      );
    }

    const cleared = await db.message.updateMany({
      where: { id: message.id, attachmentRemovedAt: null },
      data: {
        attachmentUrl: null,
        attachmentKind: null,
        attachmentBytes: null,
        attachmentRemovedAt: now,
      },
    });
    removed += cleared.count;
  }

  return removed;
}

/**
 * Messages past their ten days, except the ones that are part of the record.
 *
 * Expressed as a relational filter rather than by loading every protected
 * conversation id and passing it as `notIn`. That version worked and then
 * stopped: past about thirty-two thousand protected conversations the query
 * exceeds Postgres's bind-parameter limit and the sweep throws, and long
 * before that it is a large transfer on every run.
 *
 * The carve-outs, each of which is something somebody will one day need to
 * prove:
 *
 * - a thread tied to an order — the only account of what was agreed
 * - a thread tied to an order with a dispute open on it
 * - a thread staff flagged, which is evidence about a person, not a deal
 * - any message staff wrote, which they wrote to be found later
 */
export async function purgeOldMessages(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - MESSAGE_TTL_MS);

  const { count } = await db.message.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      // Staff notes outlive the thread they are in.
      fromStaff: false,
      conversation: {
        orders: { none: {} },
        flaggedAt: null,
      },
    },
  });

  return count;
}

/**
 * Both chat sweeps, for the scheduled endpoint.
 *
 * Media first: a message deleted by the second sweep would take its
 * attachment's row with it and leave the file orphaned on disk for ever.
 */
export async function purgeChat(): Promise<{
  media: number;
  messages: number;
}> {
  const media = await purgeExpiredMedia();
  const messages = await purgeOldMessages();
  return { media, messages };
}
