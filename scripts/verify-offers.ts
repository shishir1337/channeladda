/**
 * Offers.
 *
 * The check this file exists for is the last one: two sellers accepting two
 * different offers on the same listing at the same instant. Exactly one has to
 * win, and the loser has to be told, because both winning means two people are
 * each told they can buy the same account.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import type { ListingDraft } from "@/lib/listing-form";
import { toCents } from "@/lib/listing-form";
import * as admin from "@/server/admin-listings";
import * as offers from "@/server/offers";
import * as seller from "@/server/seller-listings";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(
    `${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`,
  );
  if (!ok) failures++;
}

const HOURS = 48;

function draft(overrides: Partial<ListingDraft> = {}): ListingDraft {
  return {
    platform: "youtube",
    handle: `@offer${Math.floor(Math.random() * 1_000_000)}`,
    title: "A listing that people are going to haggle over",
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
    ...overrides,
  };
}

/** A fresh listing, live and open to offers. */
async function liveListing(sellerId: string) {
  const id = await seller.createDraft(sellerId, draft());
  await seller.startOwnershipCheck(sellerId, id);
  await seller.submitForReview(sellerId, id);
  const approved = await admin.approveListing(id);
  if (!approved.ok) throw new Error("could not publish the fixture listing");
  return id;
}

async function main() {
  const created: string[] = [];

  const people = await db.user.findMany({
    where: { role: "USER", slug: { not: null } },
    orderBy: { id: "asc" },
    take: 3,
    select: { id: true },
  });
  check("three seeded people to work with", people.length === 3);
  const [theSeller, buyerA, buyerB] = people;

  console.log("— making an offer —");
  const listingId = await liveListing(theSeller.id);
  created.push(listingId);

  const own = await offers.createOffer({
    buyerId: theSeller.id,
    listingId,
    amountCents: toCents(900),
    message: null,
    expiryHours: HOURS,
  });
  check("a seller cannot bid on their own listing", !own.ok);

  const lowball = await offers.createOffer({
    buyerId: buyerA.id,
    listingId,
    amountCents: toCents(100),
    message: null,
    expiryHours: HOURS,
  });
  check("a lowball under half the asking price is refused", !lowball.ok);

  const first = await offers.createOffer({
    buyerId: buyerA.id,
    listingId,
    amountCents: toCents(900),
    message: "Would you take 900?",
    expiryHours: HOURS,
  });
  check("a serious offer is accepted", first.ok);
  const offerA = first.ok ? first.value : "";

  const again = await offers.createOffer({
    buyerId: buyerA.id,
    listingId,
    amountCents: toCents(950),
    message: null,
    expiryHours: HOURS,
  });
  check("the same buyer cannot stack a second open offer", !again.ok);

  console.log("\n— whose turn it is —");
  const view = await offers.getOfferFor(theSeller.id, offerA);
  check("the seller can see it", view !== null);
  check(
    "and it is their move",
    view?.awaiting === "seller",
    view?.awaiting ?? "",
  );
  check(
    "the buyer cannot accept their own offer",
    !(await offers.acceptOffer(offerA, buyerA.id, "buyer")).ok,
  );
  check(
    "a stranger cannot see it",
    (await offers.getOfferFor(buyerB.id, offerA)) === null,
  );
  check(
    "and cannot accept it",
    !(await offers.acceptOffer(offerA, buyerB.id, "seller")).ok,
  );

  console.log("\n— countering —");
  const countered = await offers.counterOffer({
    offerId: offerA,
    responderId: theSeller.id,
    as: "seller",
    amountCents: toCents(950),
    message: "950 and it is yours.",
    expiryHours: HOURS,
  });
  check("the seller can counter", countered.ok);
  const counterId = countered.ok ? countered.value : "";

  const originalNow = await offers.getOfferFor(theSeller.id, offerA);
  check(
    "the original is closed as countered",
    originalNow?.status === "COUNTERED",
    originalNow?.status,
  );
  const counterView = await offers.getOfferFor(buyerA.id, counterId);
  check(
    "the counter is marked as coming from the seller",
    counterView?.bySeller === true,
  );
  check(
    "and the ball is back with the buyer",
    counterView?.awaiting === "buyer",
    counterView?.awaiting ?? "",
  );
  check(
    "the seller cannot answer their own counter",
    !(await offers.acceptOffer(counterId, theSeller.id, "seller")).ok,
  );

  console.log("\n— expiry needs no scheduler —");
  const stale = await db.offer.create({
    data: {
      listingId,
      buyerId: buyerB.id,
      amountUsd: toCents(800),
      expiresAt: new Date(Date.now() - 60_000),
    },
    select: { id: true },
  });
  const staleView = await offers.getOfferFor(theSeller.id, stale.id);
  check(
    "an offer past its expiry reads as expired",
    staleView?.status === "OPEN" && staleView?.effectiveStatus === "EXPIRED",
    `${staleView?.status} -> ${staleView?.effectiveStatus}`,
  );
  check("nobody is waiting on it", staleView?.awaiting === null);
  check(
    "and it cannot be accepted",
    !(await offers.acceptOffer(stale.id, theSeller.id, "seller")).ok,
  );

  console.log("\n— accepting reserves the listing —");
  const accepted = await offers.acceptOffer(counterId, buyerA.id, "buyer");
  check("the buyer accepts the counter", accepted.ok);
  const reserved = await db.listing.findUniqueOrThrow({
    where: { id: listingId },
    select: { status: true },
  });
  check(
    "the listing is reserved",
    reserved.status === "RESERVED",
    reserved.status,
  );
  check(
    "and no longer takes offers",
    !(
      await offers.createOffer({
        buyerId: buyerB.id,
        listingId,
        amountCents: toCents(1200),
        message: null,
        expiryHours: HOURS,
      })
    ).ok,
  );

  const everyone = await offers.getOffersOnListing(listingId);
  const stillOpen = everyone.filter((o) => o.effectiveStatus === "OPEN");
  check(
    "every other offer got an answer rather than silence",
    stillOpen.length === 0,
    `${stillOpen.length} left hanging`,
  );

  console.log("\n— two accepts at the same instant —");
  const raceListing = await liveListing(theSeller.id);
  created.push(raceListing);

  const [ra, rb] = await Promise.all([
    offers.createOffer({
      buyerId: buyerA.id,
      listingId: raceListing,
      amountCents: toCents(900),
      message: null,
      expiryHours: HOURS,
    }),
    offers.createOffer({
      buyerId: buyerB.id,
      listingId: raceListing,
      amountCents: toCents(950),
      message: null,
      expiryHours: HOURS,
    }),
  ]);
  check("two buyers both have offers in", ra.ok && rb.ok);

  // Fired together on purpose. A read-then-write would let both through.
  const results = await Promise.all([
    offers.acceptOffer(ra.ok ? ra.value : "", theSeller.id, "seller"),
    offers.acceptOffer(rb.ok ? rb.value : "", theSeller.id, "seller"),
  ]);
  const winners = results.filter((r) => r.ok).length;
  check("exactly one accept wins", winners === 1, `${winners} succeeded of 2`);
  const loser = results.find((r) => !r.ok);
  check(
    "the loser is told the listing is taken",
    loser !== undefined && !loser.ok && loser.reason === "taken",
    loser && !loser.ok ? loser.reason : "no failure returned",
  );

  const raceAccepted = await db.offer.count({
    where: { listingId: raceListing, status: "ACCEPTED" },
  });
  check(
    "only one offer is marked accepted",
    raceAccepted === 1,
    String(raceAccepted),
  );

  console.log("\n— releasing a reservation —");
  check(
    "a reservation can be released",
    (await offers.releaseReservation(raceListing)).ok,
  );
  const back = await db.listing.findUniqueOrThrow({
    where: { id: raceListing },
    select: { status: true },
  });
  check("and the listing is live again", back.status === "LIVE", back.status);

  await db.listing.deleteMany({ where: { id: { in: created } } });

  console.log(
    `\n${failures === 0 ? "all checks passed" : `${failures} FAILED`}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
