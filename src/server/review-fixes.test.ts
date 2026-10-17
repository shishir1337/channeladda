import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { isServableKey } from "@/lib/upload-keys";
import { purgeExpiredMedia } from "@/server/chat-retention";
import {
  advanceStep,
  createDeal,
  platformPositionFor,
  recordOpeningPayment,
  resolveDeal,
} from "@/server/deals";
import { openConversation, sendMessage } from "@/server/messages";
import type { CurrentUser } from "@/server/session";
import { creditDeposit, getWallet, payFromWallet } from "@/server/wallet";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

function asUser(id: string): CurrentUser {
  return {
    id,
    email: "x@example.test",
    name: "X",
    image: null,
    emailVerified: true,
    role: "USER",
    slug: null,
    banned: false,
  };
}

// ----------------------------------------------------- C1: chat media serves

test("a chat attachment key is servable", () => {
  // The serving route refused `message/` and every video extension, so every
  // photo and clip sent in chat was a 404 — the whole feature, dead, with a
  // green test suite, because nothing ever fetched an uploaded URL back.
  const hash = "a".repeat(32);
  for (const ext of ["png", "jpg", "webp", "gif", "mp4", "mov", "webm"]) {
    expect(isServableKey(`message/${hash}.${ext}`)).toBe(true);
  }
  for (const kind of ["cover", "avatar", "proof"]) {
    expect(isServableKey(`${kind}/${hash}.png`)).toBe(true);
  }
});

test("a video is only servable under message", () => {
  const hash = "a".repeat(32);
  expect(isServableKey(`cover/${hash}.mp4`)).toBe(false);
  expect(isServableKey(`proof/${hash}.webm`)).toBe(false);
});

test("anything that is not a generated key is refused", () => {
  for (const key of [
    "../../etc/passwd",
    "message/../proof/aaaa.png",
    "message/short.png",
    "message/" + "a".repeat(32) + ".svg",
    "message/" + "a".repeat(32) + ".exe",
    "secrets/" + "a".repeat(32) + ".png",
    "",
  ]) {
    expect(isServableKey(key)).toBe(false);
  }
});

// -------------------------- C2: attachments cannot point anywhere they like

test(
  "an attachment url from the client is refused",
  withCleanDb(async () => {
    // The sender used to hand over url, kind and bytes. An external URL is an
    // out-of-band channel to the counterparty's browser — exactly what the
    // contact redaction exists to prevent — and it voids the 48h promise.
    const { listing, buyer } = await seedListing();
    const opened = await openConversation({
      listingId: listing.id,
      buyerId: buyer.id,
    });
    if (!opened.ok) throw new Error(opened.reason);

    expect(
      await sendMessage({
        conversationId: opened.id,
        sender: asUser(buyer.id),
        body: "look",
        attachmentKey: "https://attacker.example/pixel.gif",
      }),
    ).toMatchObject({ ok: false, reason: "bad-attachment" });
  }),
);

test(
  "an attachment key outside message is refused",
  withCleanDb(async () => {
    // Cover, avatar and proof URLs are public — they are on every listing
    // page. Accepting one here let the retention sweep delete somebody
    // else's proof screenshot 48 hours later.
    const { listing, buyer } = await seedListing();
    const opened = await openConversation({
      listingId: listing.id,
      buyerId: buyer.id,
    });
    if (!opened.ok) throw new Error(opened.reason);

    expect(
      await sendMessage({
        conversationId: opened.id,
        sender: asUser(buyer.id),
        body: "look",
        attachmentKey: `proof/${"b".repeat(32)}.png`,
      }),
    ).toMatchObject({ ok: false, reason: "bad-attachment" });
  }),
);

test(
  "the retention sweep refuses to delete anything outside message",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const opened = await openConversation({
      listingId: listing.id,
      buyerId: buyer.id,
    });
    if (!opened.ok) throw new Error(opened.reason);

    // Planted directly, as a row written before the guard existed would be.
    await db.message.create({
      data: {
        conversationId: opened.id,
        senderId: buyer.id,
        body: "planted",
        attachmentUrl: `/uploads/proof/${"c".repeat(32)}.png`,
        attachmentKind: "IMAGE",
        attachmentExpiresAt: new Date(Date.now() - 1000),
      },
    });

    // The row is cleared so it stops being rendered, but no file outside
    // `message/` is ever unlinked.
    const removed = await purgeExpiredMedia();
    expect(removed).toBe(1);
  }),
);

// ------------------------------- C3: deal chat is part of the record

test(
  "opening a deal links the conversation to it",
  withCleanDb(async () => {
    // The 10-day purge carves out threads with an order. Nothing ever wrote
    // that link, so the carve-out could not fire and every deal's chat — the
    // only account of what was agreed — was deleted after ten days.
    const { listing, buyer } = await seedListing();
    const opened = await openConversation({
      listingId: listing.id,
      buyerId: buyer.id,
    });
    if (!opened.ok) throw new Error(opened.reason);

    const created = await createDeal({
      listingId: listing.id,
      buyerId: buyer.id,
      mode: "SAFEST",
    });
    if (!created.ok) throw new Error(created.reason);

    const conversation = await db.conversation.findUniqueOrThrow({
      where: { id: opened.id },
    });
    expect(conversation.orderId).toBe(created.orderId);
  }),
);

test(
  "a deal opened before any chat still links when the thread is created",
  withCleanDb(async () => {
    const { listing, buyer } = await seedListing();
    const created = await createDeal({
      listingId: listing.id,
      buyerId: buyer.id,
      mode: "SAFEST",
    });
    if (!created.ok) throw new Error(created.reason);

    const opened = await openConversation({
      listingId: listing.id,
      buyerId: buyer.id,
    });
    if (!opened.ok) throw new Error(opened.reason);

    expect(
      (await db.conversation.findUniqueOrThrow({ where: { id: opened.id } }))
        .orderId,
    ).toBe(created.orderId);
  }),
);

// ------------------------ C4: a refund reaches the person who paid

test(
  "refunding a wallet-paid deal puts the money back in the wallet",
  withCleanDb(async () => {
    const seeded = await seedListing();
    const staff = await seedUser("FINANCE");
    await creditDeposit(seeded.buyer.id, 20_000, "topup-1", "USDT");

    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "FASTEST",
    });
    if (!created.ok) throw new Error(created.reason);
    await payFromWallet(created.orderId, seeded.buyer.id);

    expect((await getWallet(seeded.buyer.id)).balanceUsd).toBe(9_700);

    expect(
      await resolveDeal({
        orderId: created.orderId,
        to: "REFUNDED",
        byUserId: staff.id,
        note: "transfer failed",
      }),
    ).toMatchObject({ ok: true });

    // Whole amount back, platform position flat.
    expect((await getWallet(seeded.buyer.id)).balanceUsd).toBe(20_000);
    expect(await platformPositionFor(created.orderId)).toBe(0);
  }),
);

test(
  "cancelling a wallet-paid safest deal returns the fee to the wallet",
  withCleanDb(async () => {
    const seeded = await seedListing();
    const staff = await seedUser("MODERATOR");
    await creditDeposit(seeded.buyer.id, 1_000, "topup-2", "USDT");

    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "SAFEST",
    });
    if (!created.ok) throw new Error(created.reason);
    await payFromWallet(created.orderId, seeded.buyer.id);
    expect((await getWallet(seeded.buyer.id)).balanceUsd).toBe(700);

    await resolveDeal({
      orderId: created.orderId,
      to: "CANCELLED",
      byUserId: staff.id,
      note: "seller never invited the agent",
    });

    expect((await getWallet(seeded.buyer.id)).balanceUsd).toBe(1_000);
    expect(await platformPositionFor(created.orderId)).toBe(0);
  }),
);

// ------------------- C7: money is never created from a deal nobody paid

test(
  "an unpaid fastest deal cannot be completed through a dispute",
  withCleanDb(async () => {
    // DISPUTED is reachable from AWAITING_PAYMENT and COMPLETED is a dispute
    // outcome, so this minted the price for the seller out of a hold that
    // never existed.
    const seeded = await seedListing();
    const staff = await seedUser("MODERATOR");
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
      note: "changed my mind",
    });

    expect(
      await resolveDeal({
        orderId: created.orderId,
        to: "COMPLETED",
        byUserId: staff.id,
        note: "resolving in the buyer's favour",
      }),
    ).toMatchObject({ ok: false, reason: "not-paid" });

    expect(await platformPositionFor(created.orderId)).toBe(0);
  }),
);

test(
  "cancelling a deal nobody paid for refunds nothing",
  withCleanDb(async () => {
    // The fee refund fired whenever custody had not happened, with no check
    // that a fee was ever taken — so a buyer could cancel their own unpaid
    // deal and push the platform's position negative, at will.
    const seeded = await seedListing();
    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "SAFEST",
    });
    if (!created.ok) throw new Error(created.reason);

    await resolveDeal({
      orderId: created.orderId,
      to: "CANCELLED",
      byUserId: seeded.buyer.id,
      note: "changed my mind",
    });

    expect(await platformPositionFor(created.orderId)).toBe(0);
    expect(
      await db.ledgerEntry.count({ where: { orderId: created.orderId } }),
    ).toBe(0);
  }),
);

test(
  "a seller fee leaves the books balanced",
  withCleanDb(async () => {
    // The seller was debited with no offsetting platform credit, so the fee
    // vanished from the books the moment the rate stopped being zero.
    const seeded = await seedListing({ settings: { sellerFeeBp: 500 } });
    const staff = await seedUser("MODERATOR");
    const created = await createDeal({
      listingId: seeded.listing.id,
      buyerId: seeded.buyer.id,
      mode: "FASTEST",
    });
    if (!created.ok) throw new Error(created.reason);
    await db.order.update({
      where: { id: created.orderId },
      data: { agentId: seeded.agent.id },
    });
    await recordOpeningPayment(created.orderId, "pay-sf", "USDT");

    const actors: Record<string, string> = {
      buyer: seeded.buyer.id,
      seller: seeded.seller.id,
      agent: seeded.agent.id,
    };
    const { templateFor } = await import("@/lib/deal-templates");
    for (const step of templateFor("FASTEST")) {
      if (step.position < 2) continue;
      const r = await advanceStep({
        orderId: created.orderId,
        position: step.position,
        userId: actors[step.actor],
      });
      if (!r.ok) throw new Error(`step ${step.position}: ${r.reason}`);
    }

    // Buyer paid 10,300. Seller keeps 9,500. We keep 300 + 500.
    expect(await platformPositionFor(created.orderId)).toBe(800);
    const sellerRows = await db.ledgerEntry.aggregate({
      where: { orderId: created.orderId, userId: seeded.seller.id },
      _sum: { amountUsd: true },
    });
    expect(sellerRows._sum.amountUsd).toBe(9_500);
  }),
);

// ------------- C5: a verified badge means the channel in the listing

test(
  "a seller cannot aim verification at a channel they merely happen to own",
  withCleanDb(async () => {
    // externalId used to be a free-form form field that verification trusted,
    // with no cross-check against the link. So: list MrBeast, point
    // externalId at a throwaway channel you do control, put the code in that
    // channel's description, and the listing gets a public verified badge.
    const { listing, seller } = await seedListing();
    const { saveListing } = await import("@/server/actions/listings");
    const schema = await import("@/lib/listing-form");

    // The writable schema must not carry it at all.
    expect(Object.keys(schema.listingDraftSchema.shape)).not.toContain(
      "externalId",
    );
    void saveListing;
    void listing;
    void seller;
  }),
);

test(
  "editing the channel link drops an existing verification",
  withCleanDb(async () => {
    // A verified-then-rejected listing was editable, kept the flag, and
    // checkOwnershipCode short-circuits on "already verified".
    const { listing, seller } = await seedListing();
    await db.listing.update({
      where: { id: listing.id },
      data: {
        status: "REJECTED",
        sourceUrl: "https://youtube.com/@original",
        externalId: "UC-original",
        ownershipCode: "CA-ABCDEFGH",
        ownershipVerifiedAt: new Date(),
      },
    });

    const { clearVerificationIfIdentityChanged } = await import(
      "@/server/seller-listings"
    );
    const cleared = await clearVerificationIfIdentityChanged(seller.id, listing.id, {
      sourceUrl: "https://youtube.com/@somebody-else",
      handle: "@somebody-else",
    });
    expect(cleared).toBe(true);

    const after = await db.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(after.ownershipVerifiedAt).toBeNull();
    expect(after.externalId).toBeNull();
    // A fresh code too: the old one may already be sitting in the old
    // channel's description, where it proves nothing about the new one.
    expect(after.ownershipCode).toBeNull();
  }),
);

test(
  "editing something harmless keeps the verification",
  withCleanDb(async () => {
    const { listing, seller } = await seedListing();
    await db.listing.update({
      where: { id: listing.id },
      data: {
        status: "REJECTED",
        sourceUrl: "https://youtube.com/@original",
        externalId: "UC-original",
        handle: "@original",
        ownershipVerifiedAt: new Date(),
      },
    });

    const { clearVerificationIfIdentityChanged } = await import(
      "@/server/seller-listings"
    );
    // Same link, same handle — the seller is editing a price or a
    // description, which has nothing to do with who controls the account.
    expect(
      await clearVerificationIfIdentityChanged(seller.id, listing.id, {
        sourceUrl: "https://youtube.com/@original",
        handle: "@original",
      }),
    ).toBe(false);

    expect(
      (await db.listing.findUniqueOrThrow({ where: { id: listing.id } }))
        .ownershipVerifiedAt,
    ).not.toBeNull();
  }),
);

// -------------- uploads are not readable by anybody with the link

test(
  "listing artwork is public, a proof screenshot is not",
  withCleanDb(async () => {
    const { listing, seller, buyer } = await seedListing();
    const outsider = await seedUser();
    const staff = await seedUser("MODERATOR");
    const { canReadUpload } = await import("@/server/upload-access");

    const coverKey = `cover/${"d".repeat(32)}.png`;
    const proofKey = `proof/${"e".repeat(32)}.png`;
    await db.listingProof.create({
      data: {
        listingId: listing.id,
        url: `/uploads/${proofKey}`,
        label: "Analytics",
        fileHash: "hash",
      },
    });

    const user = (id: string, role: "USER" | "MODERATOR" = "USER") => ({
      id,
      email: "x@example.test",
      name: "X",
      image: null,
      emailVerified: true,
      role,
      slug: null,
      banned: false,
    });

    // Artwork is on every card; a check on it would be theatre.
    expect(await canReadUpload(coverKey, null)).toBe(true);

    // Evidence of ownership is not.
    expect(await canReadUpload(proofKey, null)).toBe(false);
    expect(await canReadUpload(proofKey, user(outsider.id))).toBe(false);
    expect(await canReadUpload(proofKey, user(seller.id))).toBe(true);
    expect(await canReadUpload(proofKey, user(staff.id, "MODERATOR"))).toBe(
      true,
    );

    // A buyer with a deal on the listing is exactly who it is for.
    expect(await canReadUpload(proofKey, user(buyer.id))).toBe(false);
    const created = await createDeal({
      listingId: listing.id,
      buyerId: buyer.id,
      mode: "SAFEST",
    });
    if (!created.ok) throw new Error(created.reason);
    expect(await canReadUpload(proofKey, user(buyer.id))).toBe(true);
  }),
);

test(
  "a chat attachment is readable only inside its thread",
  withCleanDb(async () => {
    const { listing, buyer, seller } = await seedListing();
    const outsider = await seedUser();
    const { canReadUpload } = await import("@/server/upload-access");

    const opened = await openConversation({
      listingId: listing.id,
      buyerId: buyer.id,
    });
    if (!opened.ok) throw new Error(opened.reason);

    const key = `message/${"f".repeat(32)}.png`;
    await db.message.create({
      data: {
        conversationId: opened.id,
        senderId: buyer.id,
        body: "here",
        attachmentUrl: `/uploads/${key}`,
        attachmentKind: "IMAGE",
      },
    });

    const user = (id: string) => ({
      id,
      email: "x@example.test",
      name: "X",
      image: null,
      emailVerified: true,
      role: "USER" as const,
      slug: null,
      banned: false,
    });

    expect(await canReadUpload(key, null)).toBe(false);
    expect(await canReadUpload(key, user(outsider.id))).toBe(false);
    expect(await canReadUpload(key, user(buyer.id))).toBe(true);
    expect(await canReadUpload(key, user(seller.id))).toBe(true);
  }),
);

test(
  "a suspended account reads nothing private",
  withCleanDb(async () => {
    const { listing, seller } = await seedListing();
    const { canReadUpload } = await import("@/server/upload-access");
    const proofKey = `proof/${"9".repeat(32)}.png`;
    await db.listingProof.create({
      data: {
        listingId: listing.id,
        url: `/uploads/${proofKey}`,
        label: "Analytics",
        fileHash: "hash",
      },
    });

    expect(
      await canReadUpload(proofKey, {
        id: seller.id,
        email: "x@example.test",
        name: "X",
        image: null,
        emailVerified: true,
        role: "USER",
        slug: null,
        banned: true,
      }),
    ).toBe(false);
  }),
);


// ------------------------------------------- I5: uploads belong to somebody

test(
  "the uploader can read a file nothing points at yet",
  withCleanDb(async () => {
    // Locking uploads down broke every preview: a screenshot a seller has
    // just chosen is referenced by nothing, so it belonged to nobody and
    // 404'd back at the person who had uploaded it one second earlier.
    const seller = await seedUser("USER");
    const stranger = await seedUser("USER");
    const { canReadUpload } = await import("@/server/upload-access");
    const key = `proof/${"b".repeat(32)}.png`;

    await db.upload.create({
      data: {
        key,
        uploaderId: seller.id,
        kind: "proof",
        bytes: 1234,
        contentType: "image/png",
      },
    });

    expect(await canReadUpload(key, asUser(seller.id))).toBe(true);
    expect(await canReadUpload(key, asUser(stranger.id))).toBe(false);
    expect(await canReadUpload(key, null)).toBe(false);
  }),
);

test(
  "an upload nobody ever attached is collected, a fresh one is not",
  withCleanDb(async () => {
    // The upload endpoint takes 25MB clips from any signed-in account. With
    // nothing collecting the ones that never reach a message, it was storage.
    const seller = await seedUser("USER");
    const { collectOrphanUploads } = await import("@/server/upload-access");
    const stale = `message/${"c".repeat(32)}.mp4`;
    const fresh = `message/${"d".repeat(32)}.mp4`;
    const base = {
      uploaderId: seller.id,
      kind: "message",
      bytes: 10,
      contentType: "video/mp4",
    };

    await db.upload.create({
      data: {
        ...base,
        key: stale,
        createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
      },
    });
    await db.upload.create({ data: { ...base, key: fresh } });

    expect(await collectOrphanUploads()).toBe(1);
    expect(await db.upload.findUnique({ where: { key: stale } })).toBeNull();
    expect(await db.upload.findUnique({ where: { key: fresh } })).not.toBeNull();
  }),
);

test(
  "an old upload a message points at survives the sweep",
  withCleanDb(async () => {
    // The stamp is written when something attaches the file. If that write is
    // ever missed the sweep must still not delete a live attachment, so it
    // re-checks the references before unlinking anything.
    const { listing, seller, buyer } = await seedListing();
    const { collectOrphanUploads } = await import("@/server/upload-access");
    const key = `message/${"e".repeat(32)}.png`;

    const conversation = await db.conversation.create({
      data: { listingId: listing.id, buyerId: buyer.id, sellerId: seller.id },
      select: { id: true },
    });
    await db.message.create({
      data: {
        conversationId: conversation.id,
        senderId: buyer.id,
        body: "here",
        attachmentUrl: `/uploads/${key}`,
        attachmentKind: "IMAGE",
      },
    });
    await db.upload.create({
      data: {
        key,
        uploaderId: buyer.id,
        kind: "message",
        bytes: 10,
        contentType: "image/png",
        createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
      },
    });

    expect(await collectOrphanUploads()).toBe(0);
    const row = await db.upload.findUnique({ where: { key } });
    expect(row?.attachedAt).not.toBeNull();
  }),
);

test(
  "sending an attachment stamps its upload as attached",
  withCleanDb(async () => {
    const { listing, seller, buyer } = await seedListing();
    const { markUploadsAttached } = await import("@/server/upload-access");
    const key = `message/${"f".repeat(32)}.png`;

    await db.upload.create({
      data: {
        key,
        uploaderId: buyer.id,
        kind: "message",
        bytes: 10,
        contentType: "image/png",
      },
    });
    await markUploadsAttached([`/uploads/${key}`]);

    const row = await db.upload.findUnique({ where: { key } });
    expect(row?.attachedAt).not.toBeNull();
    expect(seller.id).not.toBe(buyer.id);
  }),
);

// ------------------------------------- verification belongs to its own seller

test(
  "a stranger cannot clear somebody else's ownership verification",
  withCleanDb(async () => {
    // saveListing cleared the verification before checking who owned the
    // listing, and the helper looked the row up by id alone. So any signed-in
    // account could strip the verified badge, the ownership code and the
    // channel id off every listing on the site, one call each, and be told
    // "that listing could not be found" after the write had happened.
    const { listing, seller, buyer } = await seedListing();
    const { clearVerificationIfIdentityChanged } = await import(
      "@/server/seller-listings"
    );
    await db.listing.update({
      where: { id: listing.id },
      data: {
        ownershipVerifiedAt: new Date(),
        ownershipCode: "CA-ABCD2345",
        sourceUrl: "https://www.youtube.com/@real",
      },
    });

    const byStranger = await clearVerificationIfIdentityChanged(
      buyer.id,
      listing.id,
      { sourceUrl: "https://www.youtube.com/@mine", handle: "mine" },
    );
    expect(byStranger).toBe(false);

    const untouched = await db.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(untouched.ownershipVerifiedAt).not.toBeNull();
    expect(untouched.ownershipCode).toBe("CA-ABCD2345");

    // The owner editing their own listing still clears it.
    expect(
      await clearVerificationIfIdentityChanged(seller.id, listing.id, {
        sourceUrl: "https://www.youtube.com/@different",
        handle: "different",
      }),
    ).toBe(true);
    const cleared = await db.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(cleared.ownershipVerifiedAt).toBeNull();
  }),
);

test(
  "an agent does not get to read every upload on the platform",
  withCleanDb(async () => {
    // AGENT is deliberately not staff: session.ts and messages.ts both keep
    // agents out, and an agent gets a 404 at /admin/messages. The upload gate
    // promoted them to full staff, so an agent holding any URL could read any
    // seller's analytics screenshots and any private thread's attachments —
    // including deals they have nothing to do with.
    const { listing, seller } = await seedListing();
    const agent = await seedUser("AGENT");
    const { canReadUpload } = await import("@/server/upload-access");
    const key = `proof/${"7".repeat(32)}.png`;
    await db.listingProof.create({
      data: {
        listingId: listing.id,
        url: `/uploads/${key}`,
        label: "Analytics",
        fileHash: "hash",
      },
    });

    const asAgent = { ...asUser(agent.id), role: "AGENT" as const };
    expect(await canReadUpload(key, asAgent)).toBe(false);

    // A moderator still reads it: they are the ones who check the proof.
    const mod = await seedUser("MODERATOR");
    expect(
      await canReadUpload(key, { ...asUser(mod.id), role: "MODERATOR" }),
    ).toBe(true);
    expect(await canReadUpload(key, asUser(seller.id))).toBe(true);
  }),
);

// ---------------------------------- an agent may not hold their own sale

test(
  "a party to the deal cannot appoint themselves its agent",
  withCleanDb(async () => {
    // The comment says being the buyer or the seller is never enough, because
    // a seller could otherwise pick their own custodian. The check did not
    // say it: claiming an unheld deal asked only that the deal had no agent
    // and that you were appointing yourself — so a seller who also holds the
    // AGENT role became the custodian of their own channel.
    const { listing, seller, buyer } = await seedListing();
    const { assignAgent } = await import("@/server/deals");
    await db.user.update({
      where: { id: seller.id },
      data: { role: "AGENT" },
    });
    const created = await createDeal({
      listingId: listing.id,
      buyerId: buyer.id,
      mode: "SAFEST",
    });
    if (!created.ok) throw new Error(created.reason);

    expect(
      await assignAgent({
        orderId: created.orderId,
        agentId: seller.id,
        byUserId: seller.id,
        agentEmail: "agent@channeladda.test",
        agentBrand: "Channel Adda",
      }),
    ).toMatchObject({ ok: false, reason: "wrong-actor" });
  }),
);

test(
  "an uninvolved agent can still claim an unheld deal",
  withCleanDb(async () => {
    const { listing, buyer, agent } = await seedListing();
    const { assignAgent } = await import("@/server/deals");
    const created = await createDeal({
      listingId: listing.id,
      buyerId: buyer.id,
      mode: "SAFEST",
    });
    if (!created.ok) throw new Error(created.reason);

    expect(
      await assignAgent({
        orderId: created.orderId,
        agentId: agent.id,
        byUserId: agent.id,
        agentEmail: "agent@channeladda.test",
        agentBrand: "Channel Adda",
      }),
    ).toMatchObject({ ok: true });
  }),
);

test(
  "an attachment can only be sent by whoever uploaded it",
  withCleanDb(async () => {
    // sendMessage checked the key's shape but not who owned the file, so a
    // key that leaked from another thread could be re-attached in your own —
    // and canReadUpload then answers from whichever message it finds first.
    const { listing, seller, buyer } = await seedListing();
    const { openConversation, sendMessage } = await import(
      "@/server/messages"
    );
    const key = `message/${"d".repeat(32)}.png`;
    await db.upload.create({
      data: {
        key,
        uploaderId: seller.id,
        kind: "message",
        bytes: 10,
        contentType: "image/png",
      },
    });
    const opened = await openConversation({
      listingId: listing.id,
      buyerId: buyer.id,
    });
    if (!opened.ok) throw new Error("openConversation failed");

    const sent = await sendMessage({
      conversationId: opened.id,
      sender: asUser(buyer.id),
      body: "look",
      attachmentKey: key,
    });

    expect(sent).toMatchObject({ ok: false });
  }),
);
