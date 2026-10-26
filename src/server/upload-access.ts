import "server-only";

import { isCustodianRole } from "@/lib/custody-roles";
import { db } from "@/lib/db";
import { isKycReviewer } from "@/lib/kyc";
import { answersSupportChats } from "@/lib/support-chat";
import { keyFromUrl, urlForKey } from "@/lib/upload-keys";
import type { CurrentUser } from "@/server/session";
import { deleteUpload } from "@/server/storage";
import { agentListingsOnThread } from "@/server/thread-access";

/**
 * Who may read an uploaded file.
 *
 * Until now the answer was "anybody with the link", and the serving route said
 * so in a comment: a 32-hex name is unguessable, so nothing leaked by
 * accident. But proof screenshots are the evidence a seller uploads to show
 * they control an account, and they routinely contain analytics dashboards and
 * payout pages — and chat attachments are whatever two strangers sent each
 * other. A URL that reaches a support ticket, a referrer header or a browser
 * history should not be a credential.
 *
 * Artwork stays public, because it is rendered on every listing card and a
 * permission check on it would be theatre.
 */
// AGENT is deliberately not here. An agent is staff for the deals they are
// assigned to, not for the platform: session.ts keeps them out of the staff
// desks, and an agent is 404'd from /admin/messages. Reading every
// seller's analytics screenshots and every private thread's attachments
// from a URL is a wider grant than the page that would show them. What an
// agent reaches is what was sent about the listing of a deal they are
// running, and the Escrow Agent chats every live agent answers — see the
// message branch below.
const STAFF_ROLES = ["MODERATOR", "FINANCE", "SUPERADMIN"] as const;

function isStaff(user: CurrentUser | null): boolean {
  return user !== null && STAFF_ROLES.includes(user.role as "MODERATOR");
}

export async function canReadUpload(
  key: string,
  user: CurrentUser | null,
): Promise<boolean> {
  const kind = key.split("/")[0];

  // Listing artwork. On every card, so public by design.
  if (kind === "cover" || kind === "avatar") return true;

  // Everything else needs a session at minimum.
  if (!user || user.banned) return false;

  // An ID check: photos of somebody's Aadhaar card or passport and a video
  // of their face. Decided before the staff rule below, which is wider than
  // this — finance and agents have no business with identity documents, and
  // a buyer or seller never sees another member's. The member who sent it,
  // and the moderators and superadmins who review ID checks. Nobody else.
  if (kind === "kyc") {
    if (isKycReviewer(user.role)) return true;
    const upload = await db.upload.findUnique({
      where: { key },
      select: { uploaderId: true, kind: true },
    });
    return upload?.kind === "kyc" && upload.uploaderId === user.id;
  }

  if (isStaff(user)) return true;

  // Whoever uploaded it. Without this a seller could not see the thumbnail of
  // the screenshot they had just chosen, because nothing referenced it yet.
  const upload = await db.upload.findUnique({
    where: { key },
    select: { uploaderId: true },
  });
  if (upload?.uploaderId === user.id) return true;

  if (kind === "proof") {
    // The seller who uploaded it, and anybody with a deal on that listing —
    // a buyer deciding whether to pay is exactly who the evidence is for.
    const proof = await db.listingProof.findFirst({
      where: { url: urlForKey(key) },
      select: {
        listing: {
          select: {
            sellerId: true,
            orders: {
              where: { buyerId: user.id },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!proof) return false;
    return (
      proof.listing.sellerId === user.id || proof.listing.orders.length > 0
    );
  }

  if (kind === "message") {
    // The two people in the conversation it was sent in, and the agent of a
    // deal running there on the listing it was sent about — by the same
    // rule as reading the thread, so a file never reaches someone who could
    // not see the message it came with.
    const message = await db.message.findFirst({
      where: { attachmentUrl: urlForKey(key) },
      select: {
        conversationId: true,
        listingId: true,
        conversation: { select: { buyerId: true, sellerId: true } },
      },
    });
    if (!message) return canReadSupportAttachment(key, user);
    if (
      message.conversation.buyerId === user.id ||
      message.conversation.sellerId === user.id
    ) {
      return true;
    }
    return (
      isCustodianRole(user.role) &&
      (await agentListingsOnThread(user.id, message.conversationId)).includes(
        message.listingId,
      )
    );
  }

  return false;
}

/**
 * A photo or clip sent in an Escrow Agent chat: the member whose chat it is,
 * and whoever answers those chats — which includes AGENT, by the database's
 * account rather than the session's, as for the chat itself.
 */
async function canReadSupportAttachment(
  key: string,
  user: CurrentUser,
): Promise<boolean> {
  const line = await db.supportMessage.findFirst({
    where: { attachmentUrl: urlForKey(key) },
    select: { thread: { select: { memberId: true } } },
  });
  if (!line) return false;
  if (line.thread.memberId === user.id) return true;
  if (!answersSupportChats(user.role)) return false;
  const now = await db.user.findUnique({
    where: { id: user.id },
    select: { role: true, bannedAt: true },
  });
  return Boolean(now && !now.bannedAt && answersSupportChats(now.role));
}

/**
 * Stamps uploads as attached, so the orphan sweep leaves them alone.
 *
 * Called at every point something starts pointing at a file. The sweep
 * re-checks references before deleting anything, so a missed call here costs
 * a query rather than a file — but a stamp is cheaper than that query and
 * says plainly that the upload found a home.
 */
export async function markUploadsAttached(urls: (string | null | undefined)[]) {
  const keys = urls
    .map((url) => (url ? keyFromUrl(url) : null))
    .filter((key): key is string => key !== null);
  if (keys.length === 0) return;

  await db.upload.updateMany({
    where: { key: { in: keys }, attachedAt: null },
    data: { attachedAt: new Date() },
  });
}

/**
 * Deletes uploads nobody ever attached to anything.
 *
 * `purgeExpiredMedia` only removes files a message still points at, so an
 * upload abandoned halfway through a form — or produced by hitting the upload
 * endpoint in a loop — stayed on disk for ever.
 *
 * A day, not an hour. The listing form asks for a cover, an avatar and up to
 * eight proof screenshots, and the honest way to produce those is to go and
 * take them — which is longer than an hour and is exactly the behaviour the
 * form is asking for. An hour deleted the cover out from under a seller who
 * did as they were told, leaving a listing pointing at nothing with no error
 * anywhere. A day still means the upload endpoint is not storage.
 */
export async function collectOrphanUploads(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const orphans = await db.upload.findMany({
    where: { attachedAt: null, createdAt: { lt: cutoff } },
    select: { id: true, key: true },
    take: 200,
  });

  let removed = 0;
  for (const orphan of orphans) {
    const url = urlForKey(orphan.key);
    // Referenced after all? Mark it and move on rather than deleting it.
    const [proof, message, listing, step, kyc] = await Promise.all([
      db.listingProof.findFirst({
        where: { url: urlForKey(orphan.key) },
        select: { id: true },
      }),
      db.message.findFirst({
        where: { attachmentUrl: urlForKey(orphan.key) },
        select: { id: true },
      }),
      db.listing.findFirst({
        where: {
          OR: [
            { coverUrl: urlForKey(orphan.key) },
            { avatarUrl: urlForKey(orphan.key) },
          ],
        },
        select: { id: true },
      }),
      // A step's proof is the evidence a dispute is decided from.
      db.transferStep.findFirst({
        where: { proofUrl: urlForKey(orphan.key) },
        select: { id: true },
      }),
      // An ID check waiting for a moderator, or approved and kept.
      orphan.key.startsWith("kyc/")
        ? db.kycSubmission.findFirst({
            where: {
              OR: [
                { documentUrl: url },
                { documentBackUrl: url },
                { videoUrl: url },
                { selfieUrl: url },
              ],
            },
            select: { id: true },
          })
        : null,
    ]);
    // A photo or clip sent in an Escrow Agent chat.
    const supportLine =
      !(proof || message || listing || step || kyc) &&
      orphan.key.startsWith("message/")
        ? await db.supportMessage.findFirst({
            where: { attachmentUrl: url },
            select: { id: true },
          })
        : null;
    // A member's profile photo. Saving a profile did not mark it before, so
    // the members pointing at it are the only record of those.
    const member =
      !(proof || message || listing || step || kyc) &&
      orphan.key.startsWith("avatar/")
        ? await db.user.findFirst({
            where: { image: url },
            select: { id: true },
          })
        : null;

    if (proof || message || listing || step || kyc || supportLine || member) {
      await db.upload.update({
        where: { id: orphan.id },
        data: { attachedAt: new Date() },
      });
      continue;
    }

    try {
      await deleteUpload(orphan.key);
    } catch (error) {
      // An ID check's file is not named in a log, even by its key.
      console.error(
        `[uploads] could not delete ${orphan.key.startsWith("kyc/") ? "an ID check file" : orphan.key}`,
        error,
      );
      continue;
    }
    await db.upload.delete({ where: { id: orphan.id } });
    removed += 1;
  }

  return removed;
}
