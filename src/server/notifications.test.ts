import { expect, test } from "vitest";
import { db } from "@/lib/db";
import {
  listNotifications,
  markAllRead,
  markRead,
  notify,
  unreadCount,
} from "@/server/notifications";
import { seedUser, withCleanDb } from "@/test/db";

test(
  "a notification reaches the person and counts as unread",
  withCleanDb(async () => {
    const user = await seedUser();

    await notify({
      userId: user.id,
      kind: "OFFER",
      title: "Nabil offered $4,200",
      body: "On your listing, Monetized gaming channel.",
      href: "/dashboard/offers",
    });

    expect(await unreadCount(user.id)).toBe(1);
    const rows = await listNotifications(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Nabil offered $4,200");
    expect(rows[0].readAt).toBeNull();
  }),
);

test(
  "reading one, and reading all of them",
  withCleanDb(async () => {
    const user = await seedUser();
    for (const n of [1, 2, 3]) {
      await notify({
        userId: user.id,
        kind: "ORDER",
        title: `Thing ${n}`,
        body: "Body",
      });
    }
    expect(await unreadCount(user.id)).toBe(3);

    const [first] = await listNotifications(user.id);
    await markRead(first.id, user.id);
    expect(await unreadCount(user.id)).toBe(2);

    await markAllRead(user.id);
    expect(await unreadCount(user.id)).toBe(0);
  }),
);

test(
  "somebody else's notification is not yours to read",
  withCleanDb(async () => {
    const owner = await seedUser();
    const stranger = await seedUser();
    await notify({
      userId: owner.id,
      kind: "ORDER",
      title: "Private",
      body: "Body",
    });

    const [row] = await listNotifications(owner.id);
    await markRead(row.id, stranger.id);

    // Still unread, because it was never the stranger's to mark.
    expect(await unreadCount(owner.id)).toBe(1);
    expect(await listNotifications(stranger.id)).toHaveLength(0);
  }),
);

test(
  "a flood of messages in one thread is one unread notification",
  withCleanDb(async () => {
    // Someone sending ten lines in a row should not produce ten rows. The
    // point is "you have something to read in here", and it stops being that
    // the moment the bell shows 10.
    const user = await seedUser();

    for (let i = 0; i < 10; i++) {
      await notify({
        userId: user.id,
        kind: "MESSAGE",
        title: "Hannah sent you a message",
        body: `Line ${i}`,
        href: "/dashboard/messages/abc",
        collapseKey: "thread:abc",
      });
    }

    expect(await unreadCount(user.id)).toBe(1);
    // And it carries the newest message, not the first.
    const [row] = await listNotifications(user.id);
    expect(row.body).toBe("Line 9");
  }),
);

test(
  "once it has been read, the next message is a fresh notification",
  withCleanDb(async () => {
    const user = await seedUser();
    await notify({
      userId: user.id,
      kind: "MESSAGE",
      title: "Hannah sent you a message",
      body: "First",
      collapseKey: "thread:abc",
    });
    await markAllRead(user.id);

    await notify({
      userId: user.id,
      kind: "MESSAGE",
      title: "Hannah sent you a message",
      body: "Second",
      collapseKey: "thread:abc",
    });

    expect(await unreadCount(user.id)).toBe(1);
    expect(await listNotifications(user.id)).toHaveLength(2);
  }),
);

test(
  "a notification never breaks the thing that caused it",
  withCleanDb(async () => {
    // Best effort by design: a sent message, an accepted offer or a completed
    // deal step must not fail because a notification could not be written.
    await expect(
      notify({
        userId: "nobody-by-this-id",
        kind: "ORDER",
        title: "Into the void",
        body: "Body",
      }),
    ).resolves.toBeUndefined();
  }),
);

test(
  "the list is newest first and bounded",
  withCleanDb(async () => {
    const user = await seedUser();
    for (let i = 0; i < 5; i++) {
      await notify({
        userId: user.id,
        kind: "ORDER",
        title: `Thing ${i}`,
        body: "Body",
      });
    }

    const rows = await listNotifications(user.id, 3);
    expect(rows).toHaveLength(3);
    expect(rows[0].title).toBe("Thing 4");
  }),
);

test(
  "a payout request reaches the finance desk",
  withCleanDb(async () => {
    // The bell reached buyers and sellers, and nothing told the people who
    // have to act. A seller's money sat held against their balance until
    // somebody happened to open the payouts queue.
    const { requestWithdrawal, creditDeposit } = await import("@/server/wallet");
    const seller = await seedUser();
    const finance = await seedUser("FINANCE");
    const moderator = await seedUser("MODERATOR");
    await db.payoutAddress.create({
      data: { userId: seller.id, address: "TXyz1234567890abcdef", network: "TRON" },
    });
    await creditDeposit(seller.id, 50_000, "dep-notify", "USDT");

    const result = await requestWithdrawal(seller.id, 20_000);
    expect(result).toMatchObject({ ok: true });

    expect(await unreadCount(finance.id)).toBe(1);
    // Payouts are finance's, so a moderator is not interrupted by one.
    expect(await unreadCount(moderator.id)).toBe(0);
  }),
);

test(
  "a dispute reaches the moderators",
  withCleanDb(async () => {
    const { seedListing } = await import("@/test/db");
    const { createDeal, resolveDeal } = await import("@/server/deals");
    const seeded = await seedListing();
    const moderator = await seedUser("MODERATOR");
    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "FASTEST",
    });
    if (!created.ok) throw new Error(created.reason);

    await resolveDeal({
      orderId: created.orderId,
      to: "DISPUTED",
      byUserId: seeded.buyer.id,
      note: "the seller stopped replying",
    });

    expect(await unreadCount(moderator.id)).toBe(1);
    const [row] = await listNotifications(moderator.id);
    expect(row.kind).toBe("DISPUTE");
  }),
);
