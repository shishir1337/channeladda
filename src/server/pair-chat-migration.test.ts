import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

// One conversation per buyer and seller (the owner, 2026-10-26). The merge
// migration turns a pair's per-listing threads into one. Nothing anybody
// wrote may be lost on the way, and running it twice must change nothing.
//
// The database here is already migrated, so the test puts back the old
// shape inside a transaction — no pair index, lines without a listing —
// seeds the old threads, runs the merge, checks every field, runs it again,
// and rolls the lot back.

const MERGE = readFileSync(
  "prisma/migrations/20261027120100_pair_chat_merge/migration.sql",
  "utf8",
);

class Rollback extends Error {}

const T0 = new Date("2026-10-01T10:00:00.000Z").getTime();
/** Minutes after T0. */
const at = (minutes: number) => new Date(T0 + minutes * 60_000);

async function listingOf(sellerId: string, title: string) {
  return db.listing.create({
    data: {
      slug: `listing-${randomUUID().slice(0, 8)}`,
      sellerId,
      platform: "YOUTUBE",
      handle: `@${title.toLowerCase().replace(/\W+/g, "-")}`,
      title,
      niche: "Tech",
      country: "Global",
      audience: 10_000,
      engagementBp: 50,
      ageYears: 2,
      priceUsd: 10_000,
      coverUrl: "/uploads/test-cover.png",
      avatarUrl: "/uploads/test-avatar.png",
      status: "LIVE",
    },
  });
}

type Tx = Prisma.TransactionClient;

/** A thread of the old kind: one buyer, one listing. */
async function oldThread(
  tx: Tx,
  input: {
    listingId: string;
    buyerId: string;
    sellerId: string;
    createdAt: Date;
    lastMessageAt: Date;
    flaggedAt?: Date;
    flagReason?: string;
    closedAt?: Date;
    staffId?: string;
  },
) {
  const row = await tx.conversation.create({ data: input });
  return row.id;
}

/** A line written before lines had a listing of their own. */
async function oldLine(
  tx: Tx,
  conversationId: string,
  senderId: string | null,
  minutes: number,
  orderId: string | null = null,
) {
  const id = `line-${randomUUID()}`;
  await tx.$executeRaw`
    INSERT INTO "Message" ("id", "conversationId", "senderId", "body", "orderId", "createdAt")
    VALUES (${id}, ${conversationId}, ${senderId}, ${`said at ${minutes}`}, ${orderId}, ${at(minutes)})
  `;
  return id;
}

async function oldDeal(
  tx: Tx,
  input: {
    listingId: string;
    buyerId: string;
    sellerId: string;
    conversationId: string;
    agentId?: string;
  },
) {
  const row = await tx.order.create({
    data: {
      ...input,
      reference: `CA-${Math.floor(Math.random() * 1e9)}`,
      priceUsd: 10_000,
      buyerFeeUsd: 300,
      sellerFeeUsd: 0,
      totalUsd: 10_300,
    },
  });
  return row.id;
}

async function read(
  tx: Tx,
  conversationId: string,
  userId: string,
  minutes: number,
) {
  await tx.conversationRead.create({
    data: { conversationId, userId, readAt: at(minutes) },
  });
}

/** Every line somebody has not read, as `unreadByThread` counts them. */
async function unreadLines(tx: Tx, userIds: string[]) {
  const rows = await tx.$queryRaw<{ userId: string; id: string }[]>`
    SELECT u."id" AS "userId", m."id"
    FROM "User" AS u
    JOIN "Conversation" AS c ON c."buyerId" = u."id" OR c."sellerId" = u."id"
    JOIN "Message" AS m ON m."conversationId" = c."id"
    LEFT JOIN "ConversationRead" AS r
      ON r."conversationId" = c."id" AND r."userId" = u."id"
    WHERE u."id" = ANY(${userIds})
      AND m."senderId" IS NOT NULL
      AND m."senderId" <> u."id"
      AND (r."readAt" IS NULL OR m."createdAt" > r."readAt")
  `;
  return new Set(rows.map((row) => `${row.userId}:${row.id}`));
}

/** Everything the merge could touch, to compare one run with the next. */
async function snapshot(tx: Tx) {
  const [conversations, messages, orders, reads, aliases] = await Promise.all([
    tx.conversation.findMany({ orderBy: { id: "asc" } }),
    tx.$queryRaw`SELECT "id", "conversationId", "listingId" FROM "Message" ORDER BY "id"`,
    tx.order.findMany({
      orderBy: { id: "asc" },
      select: { id: true, conversationId: true },
    }),
    tx.conversationRead.findMany({
      orderBy: [{ conversationId: "asc" }, { userId: "asc" }],
    }),
    tx.conversationAlias.findMany({ orderBy: { id: "asc" } }),
  ]);
  return { conversations, messages, orders, reads, aliases };
}

test(
  "a pair's threads become one, with every line, deal, read place, flag and closure kept",
  withCleanDb(async () => {
    const { seller, buyer, agent, listing: l1 } = await seedListing();
    const [staff, other] = await Promise.all([
      seedUser("MODERATOR"),
      seedUser(),
    ]);
    const l2 = await listingOf(seller.id, "Second channel");
    const l3 = await listingOf(seller.id, "Third channel");
    // The buyer's own listing, which the seller later asked about.
    const l4 = await listingOf(buyer.id, "Buyer's channel");

    await db
      .$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(
            `DROP INDEX "Conversation_buyerId_sellerId_key"`,
          );
          await tx.$executeRawUnsafe(
            `ALTER TABLE "Message" ALTER COLUMN "listingId" DROP NOT NULL`,
          );

          // The pair: three threads, one per listing. The first is the
          // oldest, so it is the one kept.
          const t1 = await oldThread(tx, {
            listingId: l1.id,
            buyerId: buyer.id,
            sellerId: seller.id,
            createdAt: at(0),
            lastMessageAt: at(2),
          });
          const t2 = await oldThread(tx, {
            listingId: l2.id,
            buyerId: buyer.id,
            sellerId: seller.id,
            createdAt: at(60),
            lastMessageAt: at(62),
            flaggedAt: at(63),
            flagReason: "Tried to share a phone number",
            staffId: staff.id,
          });
          const t3 = await oldThread(tx, {
            listingId: l3.id,
            buyerId: buyer.id,
            sellerId: seller.id,
            createdAt: at(120),
            lastMessageAt: at(123),
            flaggedAt: at(124),
            flagReason: "Suggested moving the conversation off Channel Adda",
            closedAt: at(125),
          });
          // The other way round: the seller buying from the buyer.
          const reversed = await oldThread(tx, {
            listingId: l4.id,
            buyerId: seller.id,
            sellerId: buyer.id,
            createdAt: at(30),
            lastMessageAt: at(31),
          });
          // Somebody else with one thread, which only gains its listing.
          const single = await oldThread(tx, {
            listingId: l1.id,
            buyerId: other.id,
            sellerId: seller.id,
            createdAt: at(10),
            lastMessageAt: at(11),
          });

          const o1 = await oldDeal(tx, {
            listingId: l1.id,
            buyerId: buyer.id,
            sellerId: seller.id,
            conversationId: t1,
            agentId: agent.id,
          });
          const o2 = await oldDeal(tx, {
            listingId: l2.id,
            buyerId: buyer.id,
            sellerId: seller.id,
            conversationId: t2,
          });
          const o3 = await oldDeal(tx, {
            listingId: l3.id,
            buyerId: buyer.id,
            sellerId: seller.id,
            conversationId: t3,
          });
          const o4 = await oldDeal(tx, {
            listingId: l4.id,
            buyerId: seller.id,
            sellerId: buyer.id,
            conversationId: reversed,
          });

          const lines = {
            [t1]: [
              await oldLine(tx, t1, buyer.id, 1),
              await oldLine(tx, t1, seller.id, 2),
              await oldLine(tx, t1, agent.id, 2.25, o1),
            ],
            [t2]: [
              await oldLine(tx, t2, buyer.id, 61),
              await oldLine(tx, t2, seller.id, 62),
            ],
            [t3]: [
              await oldLine(tx, t3, buyer.id, 121),
              await oldLine(tx, t3, seller.id, 122),
              // The platform's own line: nobody to attribute it to.
              await oldLine(tx, t3, null, 123, o3),
            ],
            [reversed]: [await oldLine(tx, reversed, seller.id, 31)],
            [single]: [await oldLine(tx, single, other.id, 11)],
          };
          const listingOfThread = {
            [t1]: l1.id,
            [t2]: l2.id,
            [t3]: l3.id,
            [reversed]: l4.id,
            [single]: l1.id,
          };

          // Read places. The buyer read the first thread through and the
          // second up to their own line; never opened the third. The seller
          // read the first and the third, never the second. The agent read
          // the first, where their deal is.
          await read(tx, t1, buyer.id, 3);
          await read(tx, t2, buyer.id, 61);
          await read(tx, t1, seller.id, 2.5);
          await read(tx, t3, seller.id, 121.5);
          await read(tx, t1, agent.id, 2);
          await read(tx, reversed, buyer.id, 40);

          const people = [buyer.id, seller.id, other.id];
          const unreadBefore = await unreadLines(tx, people);
          const lineCount = await tx.message.count();

          await tx.$executeRawUnsafe(MERGE);

          // Every line kept, each about the listing its thread was about,
          // the pair's all in the thread kept.
          expect(await tx.message.count()).toBe(lineCount);
          const after = await tx.$queryRaw<
            { id: string; conversationId: string; listingId: string | null }[]
          >`SELECT "id", "conversationId", "listingId" FROM "Message"`;
          const byId = new Map(after.map((row) => [row.id, row]));
          for (const [thread, ids] of Object.entries(lines)) {
            for (const id of ids) {
              const row = byId.get(id);
              expect(row?.listingId).toBe(listingOfThread[thread]);
              const into = thread === t2 || thread === t3 ? t1 : thread;
              expect(row?.conversationId).toBe(into);
            }
          }

          // The deals follow; the reversed pair's stays where it was.
          const deals = await tx.order.findMany({
            select: { id: true, conversationId: true },
          });
          const dealIn = new Map(deals.map((d) => [d.id, d.conversationId]));
          expect(dealIn.get(o1)).toBe(t1);
          expect(dealIn.get(o2)).toBe(t1);
          expect(dealIn.get(o3)).toBe(t1);
          expect(dealIn.get(o4)).toBe(reversed);

          // One conversation per pair, the reversed pair its own.
          const threads = await tx.conversation.findMany({
            orderBy: { createdAt: "asc" },
          });
          expect(threads.map((t) => t.id).sort()).toEqual(
            [t1, reversed, single].sort(),
          );
          const kept = threads.find((t) => t.id === t1);
          // The latest activity, the latest flag with its reason, the
          // closure, and the moderator handling one of them.
          expect(kept?.lastMessageAt).toEqual(at(123));
          expect(kept?.flaggedAt).toEqual(at(124));
          expect(kept?.flagReason).toBe(
            "Suggested moving the conversation off Channel Adda",
          );
          expect(kept?.closedAt).toEqual(at(125));
          expect(kept?.staffId).toBe(staff.id);
          const back = threads.find((t) => t.id === reversed);
          expect(back?.buyerId).toBe(seller.id);
          expect(back?.sellerId).toBe(buyer.id);
          expect(back?.flaggedAt).toBeNull();
          expect(back?.closedAt).toBeNull();

          // Old links: each merged thread's id, on the listing it was about.
          expect(
            await tx.conversationAlias.findMany({
              orderBy: { listingId: "asc" },
              select: { id: true, conversationId: true, listingId: true },
            }),
          ).toEqual(
            [
              { id: t2, conversationId: t1, listingId: l2.id },
              { id: t3, conversationId: t1, listingId: l3.id },
            ].sort((a, b) => a.listingId.localeCompare(b.listingId)),
          );

          // Read places merged to the earliest, a thread never opened
          // counting as read only up to just before its first line from
          // somebody else.
          const reads = await tx.conversationRead.findMany({
            where: { conversationId: t1 },
          });
          const readAt = new Map(reads.map((r) => [r.userId, r.readAt]));
          expect(reads).toHaveLength(3);
          expect(readAt.get(buyer.id)).toEqual(at(3));
          expect(readAt.get(seller.id)).toEqual(at(2.5));
          expect(readAt.get(agent.id)).toEqual(at(2));
          expect(
            await tx.conversationRead.count({
              where: { conversationId: { in: [t2, t3] } },
            }),
          ).toBe(0);
          expect(
            (
              await tx.conversationRead.findUniqueOrThrow({
                where: {
                  conversationId_userId: {
                    conversationId: reversed,
                    userId: buyer.id,
                  },
                },
              })
            ).readAt,
          ).toEqual(at(40));

          // And so nothing anybody had not read now reads as read.
          const unreadAfter = await unreadLines(tx, people);
          for (const line of unreadBefore) {
            expect(unreadAfter.has(line)).toBe(true);
          }
          // The second thread's reply the buyer never read is still unread,
          // and so is the one in the thread the seller never opened.
          expect(unreadAfter.has(`${buyer.id}:${lines[t2][1]}`)).toBe(true);
          expect(unreadAfter.has(`${seller.id}:${lines[t2][0]}`)).toBe(true);

          // A second run changes nothing at all.
          const once = await snapshot(tx);
          await tx.$executeRawUnsafe(MERGE);
          expect(await snapshot(tx)).toEqual(once);

          throw new Rollback();
        },
        { timeout: 60_000, maxWait: 10_000 },
      )
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error;
      });

    // Rolled back: the pair index and the required listing are as the
    // migrations left them.
    const index = await db.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'Conversation'
        AND indexname = 'Conversation_buyerId_sellerId_key'
    `;
    expect(index).toHaveLength(1);
    const column = await db.$queryRaw<{ is_nullable: string }[]>`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'Message' AND column_name = 'listingId'
    `;
    expect(column[0]?.is_nullable).toBe("NO");
    expect(await db.conversation.count()).toBe(0);
  }),
);
