/**
 * Listing moderation, against the real database.
 *
 * The cases worth testing are the ones the admin screens will not produce: a
 * decision taken twice, a rejection with no reason, a listing removed while
 * money is against it, and whether the audit trail actually records who did
 * what.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import type { ListingDraft } from "@/lib/listing-form";
import * as admin from "@/server/admin-listings";
import * as seller from "@/server/seller-listings";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(
    `${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`,
  );
  if (!ok) failures++;
}

const HASH_A = "a".repeat(64);
const HASH_SHARED = "b".repeat(64);

function draft(overrides: Partial<ListingDraft> = {}): ListingDraft {
  return {
    platform: "youtube",
    handle: `@admin${Math.floor(Math.random() * 1_000_000)}`,
    title: "A listing that is going through moderation",
    niche: "Technology",
    country: "United States",
    audience: 50_000,
    monetized: true,
    monthlyRevenue: 900,
    engagement: 5.5,
    ageYears: 3,
    price: 2500,
    coverUrl: "/uploads/cover/c.png",
    avatarUrl: "/uploads/avatar/a.png",
    transferProfile: "",
    proofs: [{ url: "/uploads/proof/p.png", label: "Revenue", sha256: HASH_A }],
    ...overrides,
  };
}

/** Drives a fresh listing all the way to ADMIN_REVIEW. */
async function listingInReview(sellerId: string, overrides = {}) {
  const id = await seller.createDraft(sellerId, draft(overrides));
  await seller.startOwnershipCheck(sellerId, id);
  await seller.submitForReview(sellerId, id);
  return id;
}

async function main() {
  const created: string[] = [];

  // Established seeded sellers, by a stable ordering — see verify-seller.ts.
  const [sellers, moderator] = await Promise.all([
    db.user.findMany({
      where: { role: "USER", slug: { not: null } },
      orderBy: { id: "asc" },
      take: 2,
      select: { id: true },
    }),
    db.user.findFirstOrThrow({
      where: { role: "MODERATOR" },
      select: { id: true, name: true },
    }),
  ]);
  const [alice, bob] = sellers;

  console.log("— the queue —");
  const before = await admin.getQueueCounts();
  const id = await listingInReview(alice.id);
  created.push(id);
  const after = await admin.getQueueCounts();
  check(
    "a submitted listing joins the review queue",
    after.awaitingReview === before.awaitingReview + 1,
    `${before.awaitingReview} -> ${after.awaitingReview}`,
  );

  const queue = await admin.getReviewQueue("ADMIN_REVIEW");
  check(
    "and appears in it",
    queue.some((q) => q.id === id),
  );
  const oldestFirst = queue.every(
    (q, i) => i === 0 || queue[i - 1].waitingSince <= q.waitingSince,
  );
  check("the queue is oldest first", oldestFirst);

  console.log("\n— rejecting —");
  check(
    "a rejection with no reason is refused",
    !(await admin.rejectListing(id, "")).ok,
  );
  check(
    "a one-word rejection is refused",
    !(await admin.rejectListing(id, "nope")).ok,
  );

  const rejected = await admin.rejectListing(
    id,
    "The revenue screenshot is from a different channel.",
  );
  check("a proper rejection works", rejected.ok);
  const afterReject = await seller.getMyListing(alice.id, id);
  check(
    "the seller sees the status",
    afterReject?.status === "REJECTED",
    afterReject?.status,
  );
  check(
    "and the reason, word for word",
    afterReject?.rejectionReason ===
      "The revenue screenshot is from a different channel.",
  );
  check(
    "a rejected listing cannot be rejected again",
    !(await admin.rejectListing(id, "Something else entirely wrong.")).ok,
  );
  check(
    "nor approved out of the rejected state",
    !(await admin.approveListing(id)).ok,
  );

  console.log("\n— the seller fixes it and resubmits —");
  check(
    "a rejected listing is editable again",
    (await seller.updateDraft(alice.id, id, draft({ price: 2600 }))).ok,
  );
  const cleared = await seller.getMyListing(alice.id, id);
  check(
    "editing clears the old rejection note",
    cleared?.rejectionReason === null,
    String(cleared?.rejectionReason),
  );

  await seller.startOwnershipCheck(alice.id, id);
  await seller.submitForReview(alice.id, id);

  console.log("\n— approving —");
  const approved = await admin.approveListing(id);
  check("approval works", approved.ok);
  const live = await seller.getMyListing(alice.id, id);
  check("the listing is live", live?.status === "LIVE", live?.status);
  check("ownership is stamped", live?.ownershipVerifiedAt !== null);

  const row = await db.listing.findUniqueOrThrow({
    where: { id },
    select: { listedAt: true, createdAt: true },
  });
  check(
    "the buyer-facing clock starts at approval, not at first draft",
    row.listedAt.getTime() > row.createdAt.getTime(),
    `${row.createdAt.toISOString()} -> ${row.listedAt.toISOString()}`,
  );
  check("approving twice is refused", !(await admin.approveListing(id)).ok);

  console.log("\n— a first-time seller becomes public —");
  // This used to leave a listing LIVE in the database and a 404 on the site:
  // the public listing page needs a seller profile to link to, and a seller
  // only got a profile handle if the seed happened to give them one.
  const rookie = await db.user.create({
    data: {
      email: `rookie-${Date.now()}@example.com`,
      name: "Rookie Seller",
      emailVerified: true,
    },
    select: { id: true },
  });
  const rookieListing = await listingInReview(rookie.id);

  const beforeSlug = await db.user.findUniqueOrThrow({
    where: { id: rookie.id },
    select: { slug: true },
  });
  check("a new seller starts with no public handle", beforeSlug.slug === null);

  check(
    "their first listing can be approved",
    (await admin.approveListing(rookieListing)).ok,
  );

  const published = await db.listing.findUniqueOrThrow({
    where: { id: rookieListing },
    select: { status: true, seller: { select: { slug: true } } },
  });
  check(
    "approving gives them a handle",
    typeof published.seller.slug === "string" &&
      published.seller.slug.length > 0,
    published.seller.slug ?? "still null",
  );
  check(
    "so a live listing always has a seller page a buyer can open",
    published.status === "LIVE" && published.seller.slug !== null,
  );

  await db.listing.deleteMany({ where: { id: rookieListing } });
  await db.user.delete({ where: { id: rookie.id } });

  console.log("\n— duplicate screenshots —");
  const one = await listingInReview(alice.id, {
    proofs: [
      { url: "/uploads/proof/x.png", label: "Analytics", sha256: HASH_SHARED },
    ],
  });
  const two = await listingInReview(bob.id, {
    proofs: [
      { url: "/uploads/proof/y.png", label: "Analytics", sha256: HASH_SHARED },
    ],
  });
  created.push(one, two);

  const review = await admin.getListingForReview(two);
  const flagged = review?.proofs.find((p) => p.alsoUsedOn.length > 0);
  check(
    "the same file under another seller is flagged",
    Boolean(flagged),
    flagged ? `also on ${flagged.alsoUsedOn[0].handle}` : "not flagged",
  );

  const unique = await admin.getListingForReview(id);
  check(
    "a file used once is not flagged",
    unique?.proofs.every((p) => p.alsoUsedOn.length === 0) ?? false,
  );

  console.log("\n— taking a live listing down —");
  check(
    "removal needs a reason too",
    !(await admin.removeListing(id, "bad")).ok,
  );
  check(
    "a live listing can be removed",
    (await admin.removeListing(id, "Seller lost access to the account.")).ok,
  );
  check(
    "and is gone from the seller's editable set",
    !(await seller.updateDraft(alice.id, id, draft())).ok,
  );

  console.log("\n— a sold listing is protected —");
  await db.listing.update({ where: { id: one }, data: { status: "SOLD" } });
  check(
    "a sold listing cannot be taken down",
    !(await admin.removeListing(one, "Trying to remove something sold.")).ok,
  );

  console.log("\n— the audit trail —");
  const { recordAudit, getAuditTrail } = await import("@/server/audit");
  await recordAudit({
    actorId: moderator.id,
    action: "listing.approve",
    entity: "listing",
    entityId: id,
    before: { status: "ADMIN_REVIEW" },
    after: { status: "LIVE" },
  });
  const trail = await getAuditTrail({ entity: "listing", entityId: id }, 5);
  check("an entry is written", trail.length > 0);
  check(
    "it names the actor",
    trail[0]?.actorName === moderator.name,
    trail[0]?.actorName ?? "",
  );
  check("it records the action", trail[0]?.action === "listing.approve");
  check(
    "and what changed",
    JSON.stringify(trail[0]?.after ?? {}).includes("LIVE"),
  );

  const auditIds = trail.map((t) => t.id);
  await db.auditLog.deleteMany({ where: { id: { in: auditIds } } });
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
