/**
 * The seller listing lifecycle, exercised against the real database.
 *
 * The important cases here are the ones a browser will not produce: another
 * seller's id in a URL, an edit replayed against a live listing, a status
 * transition taken out of order.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import type { ListingDraft } from "@/lib/listing-form";
import { listingDraftSchema, listingSubmitSchema } from "@/lib/listing-form";
import * as repo from "@/server/seller-listings";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(
    `${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`,
  );
  if (!ok) failures++;
}

const HASH = "a".repeat(64);

function draft(overrides: Partial<ListingDraft> = {}): ListingDraft {
  return {
    platform: "youtube",
    handle: `@verify${Date.now() % 100000}`,
    title: "A perfectly reasonable listing title",
    niche: "Technology",
    country: "United States",
    audience: 128_000,
    monetized: true,
    monthlyRevenue: 1234.56,
    engagement: 7.4,
    ageYears: 4,
    price: 4500,
    coverUrl: `/uploads/cover/${"0".repeat(32)}.png`,
    avatarUrl: `/uploads/avatar/${"0".repeat(32)}.png`,
    transferProfile: "Brand Account",
    proofs: [{ url: "/uploads/proof/x.png", label: "Revenue", sha256: HASH }],
    ...overrides,
  };
}

async function main() {
  // Two established seeded sellers, chosen by a stable ordering.
  //
  // Picking "first user" and "newest user" made this depend on what other
  // suites had left lying around: verify-auth and verify-admin both create
  // throwaway accounts, and one of those becoming "the other seller" changes
  // what this file is actually testing. Requiring a slug restricts it to
  // sellers the seed created, and ordering by id keeps the pair the same on
  // every run.
  const sellers = await db.user.findMany({
    where: { role: "USER", slug: { not: null } },
    orderBy: { id: "asc" },
    take: 2,
    select: { id: true },
  });
  check("two established seeded sellers", sellers.length === 2);
  const [alice, bob] = sellers;
  check("and they are different people", alice.id !== bob.id);

  console.log("\n— validation —");
  check("a good draft passes", listingDraftSchema.safeParse(draft()).success);
  check(
    "a blank title is refused",
    !listingDraftSchema.safeParse(draft({ title: "short" })).success,
  );
  check(
    "a negative price is refused",
    !listingDraftSchema.safeParse(draft({ price: -10 })).success,
  );
  check(
    "engagement above 100% is refused",
    !listingDraftSchema.safeParse(draft({ engagement: 140 })).success,
  );
  check(
    "a handle with a slash is refused",
    !listingDraftSchema.safeParse(draft({ handle: "a/../b" })).success,
  );
  check(
    "a draft may have no proof",
    listingDraftSchema.safeParse(draft({ proofs: [] })).success,
  );
  check(
    "but submitting without proof is refused",
    !listingSubmitSchema.safeParse(draft({ proofs: [] })).success,
  );

  console.log("\n— money and percentages survive the round trip —");
  const id = await repo.createDraft(alice.id, draft());
  const created = await repo.getMyListing(alice.id, id);
  check("draft created", created?.status === "DRAFT", created?.status);
  check("price kept exactly", created?.price === 4500, String(created?.price));
  check(
    "revenue kept to the cent",
    created?.monthlyRevenue === 1234.56,
    String(created?.monthlyRevenue),
  );
  check(
    "engagement kept to one decimal",
    created?.engagement === 7.4,
    String(created?.engagement),
  );
  const raw = await db.listing.findUniqueOrThrow({
    where: { id },
    select: { priceUsd: true, monthlyRevenueUsd: true, engagementBp: true },
  });
  check(
    "stored as integers, no floats in the database",
    Number.isInteger(raw.priceUsd) &&
      Number.isInteger(raw.monthlyRevenueUsd) &&
      Number.isInteger(raw.engagementBp),
    `${raw.priceUsd}/${raw.monthlyRevenueUsd}/${raw.engagementBp}`,
  );
  check("proof hash stored", (created?.proofs[0]?.sha256 ?? "") === HASH);

  console.log("\n— one seller cannot touch another's listing —");
  check("bob cannot read it", (await repo.getMyListing(bob.id, id)) === null);
  check(
    "bob cannot edit it",
    !(await repo.updateDraft(bob.id, id, draft({ price: 1 }))).ok,
  );
  check(
    "bob cannot start its ownership check",
    !(await repo.startOwnershipCheck(bob.id, id)).ok,
  );
  check("bob cannot delete it", !(await repo.deleteDraft(bob.id, id)).ok);
  const stillThere = await repo.getMyListing(alice.id, id);
  check("and it is untouched", stillThere?.price === 4500);

  console.log("\n— the lifecycle runs in order —");
  check(
    "cannot go to review straight from draft",
    !(await repo.submitForReview(alice.id, id)).ok,
  );

  const started = await repo.startOwnershipCheck(alice.id, id);
  check("ownership check starts", started.ok);
  const code = started.ok ? started.code : "";
  check("a code is issued", /^CA-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code), code);
  check(
    "the code has no ambiguous characters",
    !/[01IO]/.test(code.replace("CA-", "")),
    code,
  );

  const again = await repo.startOwnershipCheck(alice.id, id);
  check(
    "asking again keeps the same code",
    again.ok && again.code === code,
    again.ok ? again.code : "",
  );

  check(
    "a listing in the code check cannot be edited",
    !(await repo.updateDraft(alice.id, id, draft({ price: 99 }))).ok,
  );

  check(
    "now it can go for review",
    (await repo.submitForReview(alice.id, id)).ok,
  );
  check(
    "and it is in review",
    (await repo.getMyListing(alice.id, id))?.status === "ADMIN_REVIEW",
  );
  check(
    "it cannot be sent for review twice",
    !(await repo.submitForReview(alice.id, id)).ok,
  );
  check(
    "a listing in review cannot be deleted",
    !(await repo.deleteDraft(alice.id, id)).ok,
  );

  check(
    "it can be pulled back",
    (await repo.withdrawFromReview(alice.id, id)).ok,
  );
  check(
    "and is editable again",
    (await repo.updateDraft(alice.id, id, draft({ price: 5000 }))).ok,
  );
  check(
    "the edit landed",
    (await repo.getMyListing(alice.id, id))?.price === 5000,
  );

  console.log("\n— pausing only applies to a live listing —");
  check(
    "a draft cannot be paused",
    !(await repo.setPaused(alice.id, id, true)).ok,
  );
  await db.listing.update({ where: { id }, data: { status: "LIVE" } });
  check(
    "a live listing can be paused",
    (await repo.setPaused(alice.id, id, true)).ok,
  );
  check(
    "a paused listing is not editable",
    !(await repo.updateDraft(alice.id, id, draft({ price: 7 }))).ok,
  );
  check("and can be resumed", (await repo.setPaused(alice.id, id, false)).ok);
  check(
    "a live listing cannot be deleted",
    !(await repo.deleteDraft(alice.id, id)).ok,
  );

  console.log("\n— slugs stay unique —");
  await db.listing.update({ where: { id }, data: { status: "DRAFT" } });
  const shared = { handle: "@collide", platform: "youtube" as const };
  const firstId = await repo.createDraft(alice.id, draft(shared));
  const secondId = await repo.createDraft(bob.id, draft(shared));
  const [first, second] = await Promise.all([
    repo.getMyListing(alice.id, firstId),
    repo.getMyListing(bob.id, secondId),
  ]);
  check(
    "two sellers with the same handle get different slugs",
    Boolean(first && second && first.slug !== second.slug),
    `${first?.slug} vs ${second?.slug}`,
  );

  // Clean up everything this run created.
  await db.listing.deleteMany({
    where: { id: { in: [id, firstId, secondId] } },
  });

  console.log(
    `\n${failures === 0 ? "all checks passed" : `${failures} FAILED`}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
