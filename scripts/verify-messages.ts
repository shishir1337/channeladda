/**
 * Mediated messaging.
 *
 * The product rule is that a buyer and a seller never get a private line to
 * each other, so these checks are mostly about who *cannot* do things: a
 * stranger reading a thread, a buyer posting into someone else's, contact
 * details surviving a send. A messaging feature that leaks any one of those
 * hands the deal to whoever is running the scam.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import type { ListingDraft } from "@/lib/listing-form";
import * as admin from "@/server/admin-listings";
import * as messages from "@/server/messages";
import * as seller from "@/server/seller-listings";
import type { CurrentUser } from "@/server/session";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(
    `${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`,
  );
  if (!ok) failures++;
}

function draft(handle: string): ListingDraft {
  return {
    platform: "youtube",
    handle,
    title: "A channel two people are going to talk about",
    niche: "Technology",
    country: "United States",
    audience: 40_000,
    monetized: false,
    monthlyRevenue: 0,
    engagement: 4,
    ageYears: 2,
    price: 1000,
    coverUrl: "/uploads/cover/c.png",
    avatarUrl: "/uploads/avatar/a.png",
    transferProfile: "",
    proofs: [
      {
        url: "/uploads/proof/p.png",
        label: "Analytics",
        sha256: "c".repeat(64),
      },
    ],
  };
}

async function liveListing(sellerId: string, handle: string) {
  const id = await seller.createDraft(sellerId, draft(handle));
  await seller.startOwnershipCheck(sellerId, id);
  await seller.submitForReview(sellerId, id);
  const approved = await admin.approveListing(id);
  if (!approved.ok) throw new Error("could not publish the fixture listing");
  return id;
}

/** The shape the repository actually reads. */
function asUser(row: { id: string; role: string }): CurrentUser {
  return {
    id: row.id,
    email: "",
    name: "",
    image: null,
    emailVerified: true,
    role: row.role as CurrentUser["role"],
    slug: null,
    banned: false,
  };
}

async function main() {
  const created: string[] = [];

  const people = await db.user.findMany({
    where: { role: "USER", slug: { not: null } },
    orderBy: { id: "asc" },
    take: 3,
    select: { id: true, role: true },
  });
  check("three seeded people to work with", people.length === 3);
  const [theSeller, theBuyer, stranger] = people.map(asUser);

  const staffRow = await db.user.findFirst({
    where: { role: "MODERATOR" },
    select: { id: true, role: true },
  });
  check("a moderator to mediate with", staffRow !== null);
  if (!staffRow) process.exit(1);
  const moderator = asUser(staffRow);

  const handle = `@talk${Math.floor(Math.random() * 1_000_000)}`;
  const listingId = await liveListing(theSeller.id, handle);
  created.push(listingId);

  console.log("— opening a conversation —");
  const own = await messages.openConversation({
    listingId,
    buyerId: theSeller.id,
  });
  check("a seller cannot open a thread with themselves", !own.ok);

  const opened = await messages.openConversation({
    listingId,
    buyerId: theBuyer.id,
  });
  check("a buyer can open one", opened.ok);
  if (!opened.ok) process.exit(1);
  const threadId = opened.id;

  const again = await messages.openConversation({
    listingId,
    buyerId: theBuyer.id,
  });
  check(
    "asking twice returns the same thread, not a second one",
    again.ok && again.id === threadId,
  );

  console.log("\n— who can read it —");
  check(
    "the buyer can",
    (await messages.getThread(threadId, theBuyer)) !== null,
  );
  check(
    "the seller can",
    (await messages.getThread(threadId, theSeller)) !== null,
  );
  check(
    "a moderator can",
    (await messages.getThread(threadId, moderator)) !== null,
  );
  check(
    "a stranger cannot",
    (await messages.getThread(threadId, stranger)) === null,
  );

  console.log("\n— who can write to it —");
  const intruder = await messages.sendMessage({
    conversationId: threadId,
    sender: stranger,
    body: "let me in",
  });
  check("a stranger cannot post", !intruder.ok);

  const clean = await messages.sendMessage({
    conversationId: threadId,
    sender: theBuyer,
    body: `Is ${handle} still monetized? What is the revenue like?`,
  });
  check("the buyer can", clean.ok);
  check(
    "and an honest question is not redacted",
    clean.ok && clean.redactedKinds.length === 0,
  );

  const afterClean = await db.conversation.findUniqueOrThrow({
    where: { id: threadId },
    select: { flaggedAt: true },
  });
  check("an honest question does not flag the thread", !afterClean.flaggedAt);

  console.log("\n— contact details do not survive —");
  const leak = await messages.sendMessage({
    conversationId: threadId,
    sender: theSeller,
    body: "sure, add me on telegram @quickdeal99 or mail me at me@example.com",
  });
  check("the message is accepted", leak.ok);
  check(
    "and reports what it took out",
    leak.ok && leak.redactedKinds.length >= 2,
    leak.ok ? leak.redactedKinds.join(", ") : "",
  );

  const stored = await db.message.findFirst({
    where: { conversationId: threadId },
    orderBy: { createdAt: "desc" },
    select: { body: true, redactedAt: true },
  });
  check(
    "the original is nowhere in the database",
    !!stored &&
      !stored.body.includes("@quickdeal99") &&
      !stored.body.includes("me@example.com"),
    stored?.body,
  );
  check("and the message is marked redacted", !!stored?.redactedAt);

  const flaggedRow = await db.conversation.findUniqueOrThrow({
    where: { id: threadId },
    select: { flaggedAt: true, flagReason: true },
  });
  check("the thread is raised to staff", flaggedRow.flaggedAt !== null);
  check(
    "with a reason a moderator can act on",
    !!flaggedRow.flagReason,
    flaggedRow.flagReason ?? "",
  );

  console.log("\n— the listing's own handle is not a contact detail —");
  const thread = await messages.getThread(threadId, theBuyer);
  check(
    "the buyer's question kept the channel handle",
    !!thread?.messages.some((m) => m.body.includes(handle)),
  );

  console.log("\n— staff mediation —");
  check(
    "a moderator can claim it",
    (await messages.claimThread(threadId, moderator.id)).ok,
  );
  check(
    "and a second one cannot take it from them",
    !(await messages.claimThread(threadId, moderator.id)).ok,
  );

  const note = await messages.sendMessage({
    conversationId: threadId,
    sender: moderator,
    body: "Keep this on Channel Adda. Escrow only covers deals made here.",
  });
  check("a moderator can write into the thread", note.ok);

  const withNote = await messages.getThread(threadId, theBuyer);
  const staffMessage = withNote?.messages.find((m) => m.fromStaff);
  check("both sides see the staff note", !!staffMessage);
  check(
    "and it is signed Channel Adda, not by a named moderator",
    staffMessage?.senderName === "Channel Adda",
    staffMessage?.senderName,
  );

  await messages.clearThreadFlag(threadId);
  const cleared = await db.conversation.findUniqueOrThrow({
    where: { id: threadId },
    select: { flaggedAt: true },
  });
  check("a moderator can clear the flag", cleared.flaggedAt === null);

  console.log("\n— closing —");
  await messages.setThreadClosed(threadId, true);
  const shut = await messages.sendMessage({
    conversationId: threadId,
    sender: theBuyer,
    body: "one more thing",
  });
  check("a closed thread refuses the buyer", !shut.ok);
  const staffStill = await messages.sendMessage({
    conversationId: threadId,
    sender: moderator,
    body: "Closed because the seller kept asking to move off-platform.",
  });
  check("but staff can still explain why", staffStill.ok);
  await messages.setThreadClosed(threadId, false);

  console.log("\n— limits —");
  check(
    "an empty message is refused",
    !(
      await messages.sendMessage({
        conversationId: threadId,
        sender: theBuyer,
        body: "   ",
      })
    ).ok,
  );
  check(
    "an oversized message is refused",
    !(
      await messages.sendMessage({
        conversationId: threadId,
        sender: theBuyer,
        body: "x".repeat(messages.MAX_MESSAGE + 1),
      })
    ).ok,
  );

  console.log("\n— what shows up in the lists —");
  const buyerInbox = await messages.listThreads(theBuyer);
  check(
    "the thread is in the buyer's inbox",
    buyerInbox.some((t) => t.id === threadId),
  );
  const strangerInbox = await messages.listThreads(stranger);
  check(
    "and not in a stranger's",
    !strangerInbox.some((t) => t.id === threadId),
  );

  await messages.markThreadRead(threadId, theBuyer);
  const stillUnread = await db.message.count({
    where: {
      conversationId: threadId,
      senderId: { not: theBuyer.id },
      readAt: null,
    },
  });
  check("marking read clears the other side's messages", stillUnread === 0);

  const staffQueue = await messages.listStaffThreads();
  check(
    "staff see it in their queue",
    staffQueue.some((t) => t.id === threadId),
  );

  // Cascades take the conversation and its messages with the listing.
  await db.listing.deleteMany({ where: { id: { in: created } } });
  const orphan = await db.conversation.count({ where: { id: threadId } });
  check("deleting the listing takes the thread with it", orphan === 0);

  console.log(
    `\n${failures === 0 ? "all checks passed" : `${failures} FAILED`}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
