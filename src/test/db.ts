import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

/**
 * The database harness for integration tests.
 *
 * Deal code is almost entirely about what ends up written down — which ledger
 * rows exist, which status a row landed in, which agent holds what. Mocking
 * Prisma would test the mock, so these tests run against real Postgres and
 * assert on real rows.
 *
 * The one thing that must never happen is this truncating a database someone
 * cares about, so the guard below is deliberately loud and runs before any
 * statement is issued.
 */

/** Every table the schema owns, children before parents. */
const TABLES = [
  "AuditLog",
  "Notification",
  "Report",
  "SupportTicket",
  "Review",
  "Dispute",
  "Withdrawal",
  "LedgerEntry",
  "Message",
  "Conversation",
  "TransferStep",
  "Order",
  "Offer",
  "Favourite",
  "ListingProof",
  "Listing",
  "PayoutAddress",
  "KycSubmission",
  "Verification",
  "Account",
  "Session",
  "PlatformSettings",
  "User",
] as const;

let guarded = false;

function assertSafeDatabase() {
  if (guarded) return;

  const test = process.env.DATABASE_URL_TEST;
  if (!test) {
    throw new Error(
      "DATABASE_URL_TEST is not set. These tests truncate every table, so they " +
        "refuse to guess which database to use. See .env.example.",
    );
  }

  // vitest.config.mts sets DATABASE_URL from DATABASE_URL_TEST, so by the time
  // the client is built they should be the same string. What must never happen
  // is the test URL naming the development database.
  const dev = process.env.DATABASE_URL;
  if (dev && dev !== test) {
    throw new Error(
      "DATABASE_URL does not match DATABASE_URL_TEST. Run the suite through " +
        "`pnpm test`, which points the client at the test database; running it " +
        "another way risks truncating development data.",
    );
  }

  if (/\/channeladda(\?|$)/.test(test)) {
    throw new Error(
      "DATABASE_URL_TEST points at the `channeladda` development database. " +
        "Point it at `channeladda_test` instead.",
    );
  }

  guarded = true;
}

/** Empties every table. One statement, so foreign keys never get in the way. */
export async function resetDb() {
  assertSafeDatabase();
  const list = TABLES.map((t) => `"public"."${t}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}

/**
 * Wraps a test body so it starts from an empty database.
 *
 * Used as the body itself — `test("...", withCleanDb(async () => { ... }))` —
 * rather than as a `beforeEach`, so a test file can mix clean-slate tests with
 * plain unit tests without the hook firing for all of them.
 */
export function withCleanDb(fn: () => Promise<void>): () => Promise<void> {
  return async () => {
    await resetDb();
    await fn();
  };
}

/** Defaults the deal tests assume. Mirrors the schema's own defaults. */
export const TEST_SETTINGS = {
  buyerFeeBpSafest: 300,
  buyerFeeBpFastest: 300,
  sellerFeeBp: 0,
  maxHoldsPerAgent: 10,
  secondApprovalAboveUsd: 500_000,
  offerExpiryHours: 48,
} as const;

export type SeedOverrides = {
  priceUsd?: number;
  listingStatus?: "DRAFT" | "LIVE" | "RESERVED" | "SOLD";
  settings?: Partial<typeof TEST_SETTINGS>;
};

/**
 * One seller, one buyer, one agent, the settings singleton, and a live listing
 * priced at $100 — the worked example from the spec, so a test asserting on a
 * 3% fee can say 300 rather than deriving it.
 */
export async function seedListing(overrides: SeedOverrides = {}) {
  assertSafeDatabase();

  const settings = await db.platformSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...TEST_SETTINGS, ...overrides.settings },
    update: { ...TEST_SETTINGS, ...overrides.settings },
  });

  const [seller, buyer, agent] = await Promise.all([
    db.user.create({
      data: {
        email: `seller-${randomUUID()}@example.test`,
        name: "Test Seller",
        slug: `seller-${randomUUID().slice(0, 8)}`,
        kycStatus: "APPROVED",
      },
    }),
    db.user.create({
      data: { email: `buyer-${randomUUID()}@example.test`, name: "Test Buyer" },
    }),
    db.user.create({
      data: {
        email: `agent-${randomUUID()}@example.test`,
        name: "Test Agent",
        role: "AGENT",
      },
    }),
  ]);

  const listing = await db.listing.create({
    data: {
      slug: `listing-${randomUUID().slice(0, 8)}`,
      sellerId: seller.id,
      platform: "YOUTUBE",
      handle: "@test-channel",
      title: "Test channel",
      niche: "Tech",
      country: "Global",
      audience: 120_000,
      monetized: true,
      monthlyRevenueUsd: 90_000,
      engagementBp: 74,
      ageYears: 3,
      priceUsd: overrides.priceUsd ?? 10_000,
      coverUrl: "/uploads/test-cover.png",
      avatarUrl: "/uploads/test-avatar.png",
      status: overrides.listingStatus ?? "LIVE",
    },
  });

  return { settings, seller, buyer, agent, listing };
}

/** A second buyer, for the races where two people want the same listing. */
export async function seedUser(role: "USER" | "AGENT" | "MODERATOR" = "USER") {
  assertSafeDatabase();
  return db.user.create({
    data: {
      email: `extra-${randomUUID()}@example.test`,
      name: `Test ${role}`,
      role,
    },
  });
}
