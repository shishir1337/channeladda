# Agent Custody and Two Deal Modes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deal lifecycle for Channel Adda's two modes — Safest (the agent holds the channel, the buyer pays the seller directly) and Fastest (the platform holds the money and pays the seller) — so a deal can be driven from creation to completion with every transition audited.

**Architecture:** All decision logic is pure and lives in `src/lib/` with no Prisma import, so the transition table, step templates and fee arithmetic are unit-testable without a database. `src/server/deals.ts` is a thin Prisma orchestration layer over those pure functions, following the repo-plus-actions pattern already used by `src/server/offers.ts` and `src/server/actions/offers.ts`. Status is coarse; the step-by-step choreography lives in `TransferStep` rows seeded from a per-mode template.

**Tech Stack:** Next 16.3.3 (App Router, React Compiler), React 19.2.8, Prisma 7.9.1 with `@prisma/adapter-pg`, Better Auth 1.7.1, Tailwind v4, Biome 2.4.2, Vitest 5, pnpm 11.24.0, Node >= 20.9.

**Spec:** `docs/superpowers/specs/2026-10-17-agent-custody-design.md`

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing any code that touches a Next API. This is a required project rule from `AGENTS.md` — this Next version has breaking changes from training data.
- Money is integer cents everywhere. Rates are basis points: `300` is 3.00%. Never store a rate on an order — orders store amounts, so a later rate change never rewrites a sale that already happened (`src/lib/fees.ts:72`).
- A user's balance is `SUM(LedgerEntry.amountUsd) WHERE userId = <id>`. Rows describing platform revenue or platform-held funds carry `userId: null` and are never counted into anyone's balance.
- The Safest channel price never gets a `LedgerEntry`. It does not pass through the platform; a row for it would make the ledger lie.
- Pure logic in `src/lib/` (no Prisma import). Prisma access in `src/server/`, each file starting `import "server-only"`. Server actions start `"use server"`.
- Enums come from `@/generated/prisma/enums`, which exports runtime `as const` objects as well as types.
- Defaults, exactly: `buyerFeeBpSafest` 300, `buyerFeeBpFastest` 300, `sellerFeeBp` 0, `maxHoldsPerAgent` 10, `secondApprovalAboveUsd` 500000.
- Migrations are named `YYYYMMDDHHMMSS_snake_case`, e.g. `20261017120000_agent_custody`.
- `pnpm typecheck` must pass at every commit. `pnpm lint` currently fails repo-wide because every committed blob has CRLF while Biome expects LF — this is pre-existing and **not** a gate for this work. Do not reformat unrelated files to chase it.
- Agents are not staff. `AGENT` must not join the `STAFF` list in `src/server/session.ts`, because every admin page except settings guards with `requireStaff()` and would open to them.

## Review Focus

Five failure modes the spec implies that no obvious task would test. Each has a test assigned to the task that owns the code.

1. **Two buyers open a deal on one listing at the same moment.** Both would get a reserved listing and a live order. Expected: exactly one succeeds, the other is told it is taken. Test in Task 6.
2. **The opening payment webhook fires twice with one reference.** Expected: one fee ledger row, not two, and the second call is a silent no-op. Test in Task 6.
3. **Fee rounding at awkward prices.** 99 USD at 3% is 2.97, not 3; a Safest order's `totalUsd` must equal the fee alone and never include the price. Test in Task 1.
4. **A step advanced by the right role on the wrong order** — the seller of listing A completing a step on listing B's deal. Role is not ownership. Expected: rejected. Test in Task 7.
5. **An agent at `maxHoldsPerAgent` assigned by two concurrent requests.** Expected: the cap holds; the second assignment fails. Test in Task 8.

---

## File Structure

**Pure, no Prisma, fully unit-tested:**
- `src/lib/deal-machine.ts` — the transition table and its guards
- `src/lib/deal-templates.ts` — the two step templates
- `src/lib/fees.ts` *(modify)* — per-mode fee arithmetic

**Prisma orchestration:**
- `src/server/deals.ts` — creation, payment, advancement, assignment, ledger
- `src/server/actions/deals.ts` — one server action per actor-facing step
- `src/server/settings.ts` *(modify)*, `src/server/audit.ts` *(modify)*, `src/server/session.ts` *(modify)*

**UI:**
- `src/components/deals/deal-timeline.tsx` — the timeline both sides see
- `src/components/listing/buy-panel.tsx` *(modify)* — mode choice
- `src/app/(dashboard)/dashboard/deals/page.tsx`, `.../[id]/page.tsx`
- `src/app/(admin)/admin/deals/page.tsx`, `src/app/(admin)/layout.tsx` *(modify)*
- `src/components/admin/settings-form.tsx` *(modify)*

**Schema:** `prisma/schema.prisma` + `prisma/migrations/20261017120000_agent_custody/migration.sql`

**Test harness:** `vitest.config.ts`, `src/test/db.ts`

---

## Task 1: Test runner and per-mode fee arithmetic

**Files:**
- Create: `vitest.config.ts`, `src/lib/fees.test.ts`
- Modify: `src/lib/fees.ts`, `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `DealMode` type usage in fees; `quote(price: number, fees: FeeSettings, mode: DealMode)`, `orderAmounts(priceCents: number, fees: FeeSettings, mode: DealMode)` returning `{ priceUsd, buyerFeeUsd, sellerFeeUsd, totalUsd, payoutUsd }`; `FeeSettings = { buyerFeeBpSafest, buyerFeeBpFastest, sellerFeeBp }`.

- [ ] **Step 1: Install Vitest and add the script**

```bash
pnpm add -D vitest vite-tsconfig-paths
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 2: Write `vitest.config.ts`**

Use `vite-tsconfig-paths` so `@/` resolves. Set `test.environment` to `"node"` and `test.include` to `["src/**/*.test.ts"]`. No Next plugin is needed — these tests import only pure modules.

- [ ] **Step 3: Write the failing test**

```ts
// src/lib/fees.test.ts
const FEES = { buyerFeeBpSafest: 300, buyerFeeBpFastest: 300, sellerFeeBp: 0 };

test("safest buyer owes the fee alone, never the price", () => {
  expect(orderAmounts(10_000, FEES, "SAFEST").totalUsd).toBe(300);
});

test("fastest buyer owes price plus fee", () => {
  expect(orderAmounts(10_000, FEES, "FASTEST").totalUsd).toBe(10_300);
});

test("fee rounds in cents, not dollars", () => {
  // Review Focus 3: 99 USD at 3% is 2.97
  expect(orderAmounts(9_900, FEES, "SAFEST").buyerFeeUsd).toBe(297);
});

test("each mode reads its own rate", () => {
  const split = { ...FEES, buyerFeeBpFastest: 500 };
  expect(orderAmounts(10_000, split, "SAFEST").buyerFeeUsd).toBe(300);
  expect(orderAmounts(10_000, split, "FASTEST").buyerFeeUsd).toBe(500);
});

test("safest never charges a seller fee", () => {
  const withSellerFee = { ...FEES, sellerFeeBp: 500 };
  expect(orderAmounts(10_000, withSellerFee, "SAFEST").sellerFeeUsd).toBe(0);
  expect(orderAmounts(10_000, withSellerFee, "FASTEST").sellerFeeUsd).toBe(500);
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `pnpm test src/lib/fees.test.ts`
Expected: FAIL — `orderAmounts` takes two arguments, and `FeeSettings` has no per-mode fields.

- [ ] **Step 5: Rewrite `src/lib/fees.ts` for per-mode rates**

Replace `buyerFeeBp` with `buyerFeeBpSafest` and `buyerFeeBpFastest` on `FeeSettings`; drop `escrowRequiredAbove`. Add a `mode: DealMode` parameter to `quote`, `buyerTotal` and `orderAmounts`. A Safest `totalUsd` is `buyerFeeUsd`; a Fastest `totalUsd` is `priceUsd + buyerFeeUsd`. `sellerFeeUsd` is zero unless the mode is `FASTEST`. Keep `applyBp` and `formatRate` as they are. Define `DealMode` locally as `"SAFEST" | "FASTEST"` for now; Task 4 replaces the import with the generated enum.

- [ ] **Step 6: Run to verify it passes, then typecheck**

Run: `pnpm test src/lib/fees.test.ts && pnpm typecheck`
Expected: PASS, then clean typecheck. Typecheck will flag existing callers of the old signature — fix them to pass the order's mode, or `"SAFEST"` where no order exists yet.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts package.json pnpm-lock.yaml src/lib/fees.ts src/lib/fees.test.ts
git commit -m "feat: per-mode fee arithmetic, with Vitest"
```

---

## Task 2: The transition table

**Files:**
- Create: `src/lib/deal-machine.ts`, `src/lib/deal-machine.test.ts`

**Interfaces:**
- Consumes: Task 1's `DealMode`.
- Produces: `type DealActor = "buyer" | "seller" | "agent" | "staff" | "system"`; `canTransition(mode: DealMode, from: OrderStatus, to: OrderStatus, actor: DealActor): boolean`; `isTerminal(status: OrderStatus): boolean`; `TERMINAL_STATUSES: readonly OrderStatus[]`.

- [ ] **Step 1: Write the failing test**

Cover every legal transition from the spec's two chains, plus one rejection per class:

```ts
test.each([
  ["SAFEST", "AWAITING_PAYMENT", "AWAITING_CUSTODY", "system"],
  ["SAFEST", "AWAITING_CUSTODY", "IN_CUSTODY", "agent"],
  ["SAFEST", "IN_CUSTODY", "AWAITING_BUYER_PAYMENT", "buyer"],
  ["SAFEST", "AWAITING_BUYER_PAYMENT", "AWAITING_HANDOVER", "seller"],
  ["SAFEST", "AWAITING_HANDOVER", "COMPLETED", "agent"],
  ["SAFEST", "AWAITING_BUYER_PAYMENT", "RETURNED_TO_SELLER", "staff"],
  ["FASTEST", "AWAITING_PAYMENT", "AGENT_VERIFYING", "system"],
  ["FASTEST", "AGENT_VERIFYING", "AWAITING_HANDOVER", "agent"],
  ["FASTEST", "AWAITING_HANDOVER", "AWAITING_RELEASE", "buyer"],
  ["FASTEST", "AWAITING_RELEASE", "COMPLETED", "agent"],
  ["FASTEST", "AWAITING_RELEASE", "REFUNDED", "staff"],
])("%s allows %s to %s by %s", (mode, from, to, actor) => {
  expect(canTransition(mode, from, to, actor)).toBe(true);
});

test("the wrong actor cannot advance a step", () => {
  expect(canTransition("SAFEST", "AWAITING_CUSTODY", "IN_CUSTODY", "buyer")).toBe(false);
});

test("a mode cannot use the other mode's states", () => {
  expect(canTransition("FASTEST", "AWAITING_CUSTODY", "IN_CUSTODY", "agent")).toBe(false);
  expect(canTransition("SAFEST", "AWAITING_RELEASE", "COMPLETED", "agent")).toBe(false);
});

test("states cannot be skipped", () => {
  expect(canTransition("SAFEST", "AWAITING_PAYMENT", "COMPLETED", "agent")).toBe(false);
});

test("nothing leaves a terminal state", () => {
  for (const status of TERMINAL_STATUSES) {
    expect(canTransition("SAFEST", status, "AWAITING_HANDOVER", "staff")).toBe(false);
  }
});

test("either side may dispute from any live state", () => {
  expect(canTransition("SAFEST", "IN_CUSTODY", "DISPUTED", "buyer")).toBe(true);
  expect(canTransition("FASTEST", "AGENT_VERIFYING", "DISPUTED", "seller")).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/lib/deal-machine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/deal-machine.ts`**

A frozen array of `{ mode, from, to, actors }` tuples transcribed from the spec's "Status transitions" section, and the three exported helpers over it. `TERMINAL_STATUSES` is `COMPLETED`, `PAYMENT_EXPIRED`, `CANCELLED`, `RETURNED_TO_SELLER`, `REFUNDED`. `DISPUTED` is reachable from every non-terminal state by `buyer`, `seller` or `staff`, and is not itself terminal — staff resolve it onward.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/lib/deal-machine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/deal-machine.ts src/lib/deal-machine.test.ts
git commit -m "feat: deal status transition table"
```

---

## Task 3: Step templates

**Files:**
- Create: `src/lib/deal-templates.ts`, `src/lib/deal-templates.test.ts`

**Interfaces:**
- Consumes: Task 1's `DealMode`, Task 2's `DealActor`.
- Produces: `type StepTemplate = { position: number; label: string; actor: DealActor; entersStatus?: OrderStatus; needsApprovalAbove?: boolean }`; `templateFor(mode: DealMode): readonly StepTemplate[]`.

- [ ] **Step 1: Write the failing test**

```ts
test("safest has nine steps in the spec's order", () => {
  const steps = templateFor("SAFEST");
  expect(steps).toHaveLength(9);
  expect(steps.map((s) => s.actor)).toEqual([
    "buyer", "seller", "agent", "agent", "buyer", "buyer", "seller", "agent", "agent",
  ]);
  expect(steps[5].label).toBe("Pay the seller directly");
});

test("fastest has six steps in the spec's order", () => {
  const steps = templateFor("FASTEST");
  expect(steps).toHaveLength(6);
  expect(steps.map((s) => s.actor)).toEqual([
    "buyer", "seller", "agent", "seller", "buyer", "agent",
  ]);
});

test("positions are 1..n with no gaps", () => {
  for (const mode of ["SAFEST", "FASTEST"] as const) {
    const positions = templateFor(mode).map((s) => s.position);
    expect(positions).toEqual(positions.map((_, i) => i + 1));
  }
});

test("the value-handing step is the one needing second approval", () => {
  expect(templateFor("SAFEST").filter((s) => s.needsApprovalAbove).map((s) => s.position)).toEqual([8]);
  expect(templateFor("FASTEST").filter((s) => s.needsApprovalAbove).map((s) => s.position)).toEqual([6]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/lib/deal-templates.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/deal-templates.ts`**

Two frozen arrays, labels copied verbatim from the spec's "Step templates" tables. `entersStatus` is set on the steps that move the order's coarse status, per the spec's transition chains.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/lib/deal-templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/deal-templates.ts src/lib/deal-templates.test.ts
git commit -m "feat: per-mode deal step templates"
```

---

## Task 4: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma`, `src/lib/fees.ts`, `src/lib/deal-machine.ts`, `src/lib/deal-templates.ts`
- Create: `prisma/migrations/20261017120000_agent_custody/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: the generated enums `DealMode`, `OrderStatus` (extended), `UserRole` (with `AGENT`), `LedgerKind` (with `DEPOSIT`) at `@/generated/prisma/enums`; `Order.agentId`, `Order.agentEmail`, `Order.agentBrand`, `Order.feePaidAt`, `Order.custodyAt`, `Order.buyerPaidAt`, `Order.buyerPaymentRef`, `Order.sellerConfirmedAt`, `Order.handoverAt`; `TransferStep.approvedById`; `PlatformSettings` fee and safeguard fields.

- [ ] **Step 1: Apply the spec's "Data model changes" to `prisma/schema.prisma`**

Transcribe the spec section exactly: add `AGENT` to `UserRole`; replace `CheckoutMode` with `DealMode`; extend `OrderStatus` with the eleven states plus `AWAITING_RELEASE`; add `DEPOSIT` to `LedgerKind`; add the `Order` columns, relation `"OrderAgent"` and `@@index([agentId, status])`; add `TransferStep.approvedById` with relation `"StepApprover"`; replace `PlatformSettings.buyerFeeBp` and `escrowRequiredAboveUsd` with the four new fields; add `@@index([entity, createdAt])` to `AuditLog`. Add the matching back-relations on `User` (`ordersAgented`, `stepsApproved`).

- [ ] **Step 2: Generate the migration and the client**

Run: `pnpm exec prisma migrate dev --name agent_custody --create-only`
Rename the generated directory to `20261017120000_agent_custody` to match the project's convention, then run `pnpm exec prisma migrate deploy && pnpm exec prisma generate`.

- [ ] **Step 3: Verify the migration applied and the enums are generated**

Run: `pnpm exec prisma migrate status && grep -c "AWAITING_RELEASE\|AGENT" src/generated/prisma/enums.ts`
Expected: migrations up to date; the grep finds both names.

- [ ] **Step 4: Switch the pure modules onto the generated enums**

Replace the local `DealMode` union in `src/lib/fees.ts` and the status strings in `deal-machine.ts` and `deal-templates.ts` with `import type { DealMode, OrderStatus } from "@/generated/prisma/enums"`.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all Task 1-3 tests still pass; typecheck clean. Existing readers of `PlatformSettings.buyerFeeBp` and `escrowRequiredAboveUsd` will fail here — narrow those call sites to `buyerFeeBpSafest` and delete the escrow-threshold branch. Also widen the `getSettings()` select in `src/server/settings.ts` to return all five new fields now, because Tasks 6-8 read `secondApprovalAboveUsd` and `maxHoldsPerAgent` through it. Task 9 owns the admin form and the save action, not this read.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/generated/prisma src/lib
git commit -m "feat: agent custody schema and two deal modes"
```

---

## Task 5: Database test harness

**Files:**
- Create: `src/test/db.ts`
- Modify: `vitest.config.ts`, `package.json`, `.env.example` (create if absent)

**Interfaces:**
- Consumes: Task 4's schema.
- Produces: `withCleanDb(fn: () => Promise<void>): () => Promise<void>` for use as a Vitest test body wrapper; `seedListing(overrides?): Promise<{ listing, seller, buyer, agent }>` returning created rows.

- [ ] **Step 1: Create the test database**

The dev container `dealbaron-db` already publishes 5433. Create a sibling database so tests never touch dev data:

```bash
docker exec dealbaron-db psql -U channeladda -c "CREATE DATABASE channeladda_test OWNER channeladda"
DATABASE_URL="postgresql://channeladda:channeladda_dev@127.0.0.1:5433/channeladda_test?schema=public" pnpm exec prisma migrate deploy
```

Record the test URL in `.env.example` as `DATABASE_URL_TEST`, with a comment that tests truncate every table and must never point at a real database.

- [ ] **Step 2: Write `src/test/db.ts`**

Export `withCleanDb`, which truncates every table except `_prisma_migrations` with one `TRUNCATE ... CASCADE` before the body runs, and `seedListing`, which inserts a seller, a buyer, an `AGENT` user, a `PlatformSettings` singleton at the documented defaults, and one `LIVE` listing priced at 10,000 cents. Read `DATABASE_URL_TEST` and throw if it is unset or equals `DATABASE_URL` — a test suite that silently truncates the dev database is worse than one that does not run.

- [ ] **Step 3: Point Vitest at the test database**

Add `test.env.DATABASE_URL` sourced from `process.env.DATABASE_URL_TEST` in `vitest.config.ts`, and `test.fileParallelism: false` so suites sharing one database do not truncate each other mid-run.

- [ ] **Step 4: Prove the harness works**

Write `src/test/db.test.ts` asserting that `seedListing` returns a listing with `status: "LIVE"` and `priceUsd: 10_000`, and that a row inserted in one test is absent in the next.

Run: `pnpm test src/test/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/test/ vitest.config.ts package.json .env.example
git commit -m "test: database harness against a dedicated test database"
```

---

## Task 6: Deal creation, opening payment and the ledger

**Files:**
- Create: `src/server/deals.ts`, `src/server/deals.test.ts`

**Interfaces:**
- Consumes: Tasks 1-3 pure modules; Task 5's `withCleanDb`, `seedListing`.
- Produces: `type DealFailure = "not-found" | "not-live" | "own-listing" | "taken" | "wrong-actor" | "wrong-step" | "terminal" | "cap-reached" | "needs-approval"`; `createDeal(input: { listingId: string; buyerId: string; mode: DealMode }): Promise<{ ok: true; orderId: string; reference: string } | { ok: false; reason: DealFailure }>`; `recordOpeningPayment(orderId: string, ref: string, asset: string): Promise<void>`; `balanceOf(userId: string): Promise<number>`.

- [ ] **Step 1: Write the failing test**

```ts
test("creating a deal reserves the listing and seeds the template", withCleanDb(async () => {
  const { listing, buyer } = await seedListing();
  const result = await createDeal({ listingId: listing.id, buyerId: buyer.id, mode: "SAFEST" });
  expect(result.ok).toBe(true);
  const order = await db.order.findUniqueOrThrow({ where: { id: result.orderId }, include: { steps: true } });
  expect(order.status).toBe("AWAITING_PAYMENT");
  expect(order.totalUsd).toBe(300);          // fee alone
  expect(order.steps).toHaveLength(9);
  expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("RESERVED");
}));

test("a buyer cannot buy their own listing", withCleanDb(async () => { /* expect reason "own-listing" */ }));

test("only one of two simultaneous buyers wins", withCleanDb(async () => {
  // Review Focus 1
  const { listing, buyer, seller } = await seedListing();
  const other = await db.user.create({ data: { email: "b2@example.com", name: "B2" } });
  const results = await Promise.all([
    createDeal({ listingId: listing.id, buyerId: buyer.id, mode: "SAFEST" }),
    createDeal({ listingId: listing.id, buyerId: other.id, mode: "SAFEST" }),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(results.find((r) => !r.ok)?.reason).toBe("taken");
}));

test("the safest fee is the only ledger row", withCleanDb(async () => {
  // ...create, then:
  await recordOpeningPayment(orderId, "cryptomus-1", "USDT");
  const rows = await db.ledgerEntry.findMany({ where: { orderId } });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ kind: "BUYER_FEE", amountUsd: 300, userId: null });
  expect(await balanceOf(sellerId)).toBe(0);
}));

test("fastest payment holds the full amount", withCleanDb(async () => {
  // expect one ESCROW_HOLD row, amountUsd 10_300, userId null
}));

test("a repeated payment reference is a no-op", withCleanDb(async () => {
  // Review Focus 2
  await recordOpeningPayment(orderId, "cryptomus-1", "USDT");
  await recordOpeningPayment(orderId, "cryptomus-1", "USDT");
  expect(await db.ledgerEntry.count({ where: { orderId } })).toBe(1);
}));
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/server/deals.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement creation and payment in `src/server/deals.ts`**

`createDeal` computes amounts with `orderAmounts(listing.priceUsd, settings, mode)`, seeds `TransferStep` rows from `templateFor(mode)`, and reserves the listing. The reservation must be a **compare-and-set**, not a read-then-write — follow `acceptOffer` in `src/server/offers.ts:285`, which guards the same "two buyers, one listing" race with a conditional update and treats a zero row count as `"taken"`. Generate `reference` as `CA-` plus five digits, retrying on unique violation.

`recordOpeningPayment` is idempotent on `paymentRef`: return early if the order already has that reference. Otherwise set `paymentRef`, `paymentAsset`, `paidAt`, `feePaidAt`, write the mode's ledger rows from the spec's "Money and the ledger" section, and move the status to `AWAITING_CUSTODY` (Safest) or `AGENT_VERIFYING` (Fastest) through `canTransition(..., "system")`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/server/deals.test.ts && pnpm typecheck`
Expected: PASS, clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add src/server/deals.ts src/server/deals.test.ts
git commit -m "feat: deal creation and opening payment"
```

---

## Task 7: Step advancement and resolution

**Files:**
- Modify: `src/server/deals.ts`, `src/server/deals.test.ts`

**Interfaces:**
- Consumes: Task 6's `DealFailure`.
- Produces: `advanceStep(input: { orderId: string; position: number; userId: string; proofUrl?: string; paymentRef?: string }): Promise<{ ok: true } | { ok: false; reason: DealFailure }>`; `getDealFor(userId: string, orderId: string): Promise<DealView | null>` where `DealView` carries `id, reference, mode, status, priceUsd, totalUsd, buyerFeeUsd, listingTitle, listingSlug, buyerName, sellerName, agentName, agentEmail, agentBrand, viewerRole, steps: { position, label, actor, completedAt, proofUrl }[], nextStep`; `resolveDeal(input: { orderId: string; to: "CANCELLED" | "RETURNED_TO_SELLER" | "REFUNDED" | "DISPUTED"; byUserId: string; note: string }): Promise<{ ok: true } | { ok: false; reason: DealFailure }>`.

- [ ] **Step 1: Write the failing test**

```ts
test("a safest deal runs end to end", withCleanDb(async () => {
  // pay fee, then advance 2..9 as the right actor each time
  expect(order.status).toBe("COMPLETED");
  expect(order.custodyAt).not.toBeNull();
  expect(order.buyerPaidAt).not.toBeNull();
  expect(order.sellerConfirmedAt).not.toBeNull();
  expect((await db.listing.findUniqueOrThrow(...)).status).toBe("SOLD");
  expect(await db.ledgerEntry.count({ where: { orderId, kind: "ESCROW_RELEASE" } })).toBe(0);
}));

test("a fastest deal credits the seller on release", withCleanDb(async () => {
  // run steps 2..6; sellerFeeBp is 0, so:
  expect(await balanceOf(sellerId)).toBe(10_000);
}));

test("steps cannot be done out of order", withCleanDb(async () => { /* reason "wrong-step" */ }));

test("the wrong actor is rejected", withCleanDb(async () => { /* buyer tries the agent's step: "wrong-actor" */ }));

test("the right role on someone else's deal is rejected", withCleanDb(async () => {
  // Review Focus 4: a second seller with their own listing tries to advance this deal's seller step
  expect(result).toMatchObject({ ok: false, reason: "wrong-actor" });
}));

test("the buyer's direct payment records its reference", withCleanDb(async () => {
  await advanceStep({ orderId, position: 6, userId: buyerId, paymentRef: "0xabc" });
  expect((await db.order.findUniqueOrThrow(...)).buyerPaymentRef).toBe("0xabc");
}));

test("a completed deal rejects further steps", withCleanDb(async () => { /* reason "terminal" */ }));

test("an abandoned safest deal returns the channel and keeps the fee", withCleanDb(async () => {
  // pay the fee, advance to AWAITING_BUYER_PAYMENT, then staff give up on the buyer
  await resolveDeal({ orderId, to: "RETURNED_TO_SELLER", byUserId: staffId, note: "buyer unreachable" });
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  expect(order.status).toBe("RETURNED_TO_SELLER");
  expect((await db.listing.findUniqueOrThrow(...)).status).toBe("LIVE");
  expect(await db.ledgerEntry.count({ where: { orderId, kind: "BUYER_FEE" } })).toBe(1);
  expect(await db.ledgerEntry.count({ where: { orderId, kind: "REFUND" } })).toBe(0);
}));

test("a refunded fastest deal reverses the hold", withCleanDb(async () => {
  await resolveDeal({ orderId, to: "REFUNDED", byUserId: staffId, note: "transfer failed" });
  const refund = await db.ledgerEntry.findFirstOrThrow({ where: { orderId, kind: "REFUND" } });
  expect(refund).toMatchObject({ amountUsd: -10_300, userId: null });
}));

test("either side can dispute a live deal", withCleanDb(async () => {
  expect(await resolveDeal({ orderId, to: "DISPUTED", byUserId: buyerId, note: "not as listed" })).toMatchObject({ ok: true });
}));

test("a buyer cannot cancel their way out after custody", withCleanDb(async () => {
  // past AWAITING_PAYMENT, CANCELLED is not reachable
  expect(await resolveDeal({ orderId, to: "CANCELLED", byUserId: buyerId, note: "changed my mind" }))
    .toMatchObject({ ok: false, reason: "wrong-actor" });
}));
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/server/deals.test.ts -t "advance"`
Expected: FAIL — `advanceStep` is not exported.

- [ ] **Step 3: Implement `advanceStep`, `getDealFor` and `resolveDeal`**

`advanceStep` resolves the caller's role **from the order** — buyer, seller or assigned agent — never from a parameter, the way `sideOf` in `src/server/actions/offers.ts:44` does it. It rejects a caller who is none of those as `"wrong-actor"`, which is what makes Review Focus 4 pass. It then requires the position to be the lowest incomplete step, requires the template's actor to match, checks `canTransition` when the step carries `entersStatus`, stamps the matching `Order` timestamp, and on the final step sets the listing `SOLD` and writes the completion ledger rows for Fastest.

`resolveDeal` is the only way into the four non-completion terminals, so they are reachable rather than dead enum values. It routes through `canTransition` with the caller's resolved actor, which is what makes `CANCELLED` staff- and buyer-reachable only from `AWAITING_PAYMENT`. On `RETURNED_TO_SELLER` and `CANCELLED` it releases the listing back to `LIVE` via `releaseReservation` (`src/server/offers.ts:419`) and writes no refund row — the fee is kept, per the spec. On `REFUNDED` it writes `{ userId: null, kind: REFUND, amount: -totalUsd }`. `note` goes into the audit row's `after` payload.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/server/deals.test.ts && pnpm typecheck`
Expected: PASS, clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add src/server/deals.ts src/server/deals.test.ts
git commit -m "feat: deal step advancement with actor and order guards"
```

---

## Task 8: Agent assignment and safeguards

**Files:**
- Modify: `src/server/deals.ts`, `src/server/deals.test.ts`

**Interfaces:**
- Consumes: Task 7's `advanceStep`.
- Produces: `assignAgent(input: { orderId: string; agentId: string; agentEmail: string; agentBrand: string; byUserId: string }): Promise<{ ok: true } | { ok: false; reason: DealFailure }>`; `holdsFor(agentId: string): Promise<number>`.

- [ ] **Step 1: Write the failing test**

```ts
const HOLDING = ["AWAITING_CUSTODY", "IN_CUSTODY", "AWAITING_BUYER_PAYMENT", "AWAITING_HANDOVER"];

test("assignment records the agent's email and brand", withCleanDb(async () => { /* ... */ }));

test("holds count only safest orders in a holding state", withCleanDb(async () => {
  // one order per HOLDING status plus one COMPLETED and one FASTEST
  expect(await holdsFor(agentId)).toBe(HOLDING.length);
}));

test("assignment past the cap is refused", withCleanDb(async () => {
  await db.platformSettings.update({ where: { id: "singleton" }, data: { maxHoldsPerAgent: 1 } });
  // first assignment ok, second:
  expect(second).toMatchObject({ ok: false, reason: "cap-reached" });
}));

test("the cap survives two concurrent assignments", withCleanDb(async () => {
  // Review Focus 5
  await db.platformSettings.update({ where: { id: "singleton" }, data: { maxHoldsPerAgent: 1 } });
  const results = await Promise.all([assignAgent(a), assignAgent(b)]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
}));

test("a high-value handover needs a second approver", withCleanDb(async () => {
  // listing at 600_000 cents, secondApprovalAboveUsd 500_000
  expect(await advanceStep({ orderId, position: 8, userId: agentId })).toMatchObject({
    ok: false, reason: "needs-approval",
  });
  expect(await advanceStep({ orderId, position: 8, userId: agentId, approvedById: staffId })).toMatchObject({ ok: true });
}));

test("the approver cannot be the agent", withCleanDb(async () => { /* reason "needs-approval" */ }));
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test src/server/deals.test.ts -t "agent"`
Expected: FAIL — `assignAgent` is not exported.

- [ ] **Step 3: Implement assignment, the cap and second approval**

`advanceStep` grows an optional `approvedById`. The cap check and the insert must be in one serialisable transaction, or the concurrent test will pass twice — count holds and write `agentId` inside `db.$transaction` with `isolationLevel: "Serializable"`, mapping a serialisation failure to `"cap-reached"`. Second approval applies when the step's `needsApprovalAbove` is set and `order.priceUsd >= settings.secondApprovalAboveUsd`; the approver must be a different user with a staff role.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test src/server/deals.test.ts && pnpm typecheck`
Expected: PASS, clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add src/server/deals.ts src/server/deals.test.ts
git commit -m "feat: agent assignment, concurrency cap and second approval"
```

---

## Task 9: Audit trail, settings surface and the admin feed

**Files:**
- Modify: `src/server/audit.ts`, `src/server/deals.ts`, `src/server/settings.ts`, `src/server/actions/settings.ts`, `src/components/admin/settings-form.tsx`
- Create: `src/server/deal-feed.ts`, `src/server/deal-feed.test.ts`

**Interfaces:**
- Consumes: Task 8's `assignAgent`.
- Produces: `recordAudit` accepting `actorId: string | null`; `listDealActivity(limit?: number): Promise<DealActivityRow[]>` where a row carries `id, action, createdAt, actorName, orderReference, orderStatus, listingTitle, amountUsd`.

- [ ] **Step 1: Widen `recordAudit` and add the settings fields**

Change `AuditEntry.actorId` to `string | null` so system transitions are recorded rather than skipped — the column is already nullable. Task 4 already widened the `getSettings()` read, so this step covers the write path: add `buyerFeeBpSafest`, `buyerFeeBpFastest`, `sellerFeeBp`, `maxHoldsPerAgent` and `secondApprovalAboveUsd` to the save action's Zod schema and the admin form, and remove `escrowRequiredAboveUsd`. Keep `MAX_FEE_BP` as the ceiling on all three rates, and reject a `maxHoldsPerAgent` below 1.

- [ ] **Step 2: Write the failing test**

```ts
test("every transition appears on the feed, newest first", withCleanDb(async () => {
  // drive a safest deal to COMPLETED, then:
  const rows = await listDealActivity();
  expect(rows.length).toBeGreaterThanOrEqual(9);
  expect(rows[0].createdAt.getTime()).toBeGreaterThanOrEqual(rows[1].createdAt.getTime());
  expect(rows.map((r) => r.action)).toContain("deal.completed");
}));

test("a system transition is recorded with no actor", withCleanDb(async () => {
  await recordOpeningPayment(orderId, "ref", "USDT");
  const row = await db.auditLog.findFirstOrThrow({ where: { action: "deal.fee_paid" } });
  expect(row.actorId).toBeNull();
}));

test("the feed carries only order entities", withCleanDb(async () => { /* ... */ }));
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm test src/server/deal-feed.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the audit writes and the feed**

Every status change and step completion in `src/server/deals.ts` writes `recordAudit` with entity `"order"` and an action named `deal.<event>` (`deal.created`, `deal.fee_paid`, `deal.step_completed`, `deal.agent_assigned`, `deal.completed`, `deal.returned`, `deal.refunded`). `listDealActivity` reads `AuditLog` where `entity = "order"`, ordered by `createdAt` descending, joining the order, its listing and the actor's name.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, clean typecheck.

- [ ] **Step 6: Commit**

```bash
git add src/server/audit.ts src/server/deals.ts src/server/deal-feed.ts src/server/deal-feed.test.ts src/server/settings.ts src/server/actions/settings.ts src/components/admin/settings-form.tsx
git commit -m "feat: deal audit trail, admin activity feed and fee settings"
```

---

## Task 10: Server actions

**Files:**
- Create: `src/server/actions/deals.ts`
- Modify: `src/server/session.ts`

**Interfaces:**
- Consumes: Tasks 6-8 repo functions.
- Produces: `startDeal(listingId: string, mode: DealMode)`, `completeStep(orderId: string, position: number, extra?: { proofUrl?: string; paymentRef?: string })`, `assignSelfAsAgent(orderId: string)`, `approveStep(orderId: string, position: number)`, `markOpeningPaymentReceived(orderId: string, ref: string, asset: string)`, `endDeal(orderId: string, to: "CANCELLED" | "RETURNED_TO_SELLER" | "REFUNDED" | "DISPUTED", note: string)` — each returning `{ ok: true } | { ok: false; error: string }`; `requireAdminArea(): Promise<CurrentUser>` and `requireAgent(): Promise<CurrentUser>`.

- [ ] **Step 1: Add the role guards**

`requireAdminArea` admits `STAFF` plus `AGENT` and is used only by the admin layout. `requireAgent` admits `AGENT` and `SUPERADMIN`. Leave the `STAFF` constant untouched: every existing admin page guards with `requireStaff()`, so adding `AGENT` there would open the listing queue, user management, messages and support to agents.

- [ ] **Step 2: Write `src/server/actions/deals.ts`**

Follow `src/server/actions/offers.ts` exactly: `"use server"` at the top, `import * as repo from "@/server/deals"`, a `MESSAGES: Record<repo.DealFailure, string>` map, a `fail()` helper and a `refresh()` helper calling `revalidatePath`. Read the relevant Next doc for `revalidatePath` before writing it, per `AGENTS.md`. The caller's identity always comes from `requireUser()`; no action takes a user id or a role from its arguments.

Messages, one per `DealFailure`: `not-found` "That deal is no longer available."; `not-live` "This listing is not accepting deals right now."; `own-listing` "You cannot buy your own listing."; `taken` "Someone else got there first — this listing is no longer available."; `wrong-actor` "This step is not yours to complete."; `wrong-step` "An earlier step is still open."; `terminal` "This deal is already closed."; `cap-reached` "This agent is holding as many channels as they can. Assign another."; `needs-approval` "A second staff member has to approve this handover."

`markOpeningPaymentReceived` is the stand-in for the Cryptomus webhook that Phase 2 brings, and it is the only reason a deal can be driven end to end in the real app before then. Guard it with `requireRole("FINANCE")` — it is the action that decides money arrived. `endDeal` takes `requireUser()` and lets `resolveDeal` reject a caller who is not entitled to that particular terminal, so a buyer can dispute but cannot refund themselves.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: clean typecheck, suite still green. There is no new unit test here — the actions are a thin mapping over Task 6-8 behaviour that is already covered, and the guards are exercised by Task 12's pages.

- [ ] **Step 4: Commit**

```bash
git add src/server/actions/deals.ts src/server/session.ts
git commit -m "feat: deal server actions and agent role guards"
```

---

## Task 11: Buyer and seller UI

**Files:**
- Create: `src/components/deals/deal-timeline.tsx`, `src/app/(dashboard)/dashboard/deals/page.tsx`, `src/app/(dashboard)/dashboard/deals/[id]/page.tsx`
- Modify: `src/components/listing/buy-panel.tsx`

**Interfaces:**
- Consumes: Task 7's `getDealFor` and `DealView`; Task 10's actions.
- Produces: `<DealTimeline deal={DealView} />`.

- [ ] **Step 1: Add the mode choice to the buy panel**

Two options with the spec's own framing: **Safest** — "You pay the seller directly after our agent has the channel. Two Google waiting periods." **Fastest** — "You pay everything up front and we pay the seller. One Google waiting period." Show `buyerTotal(price, settings, mode)` live as the choice changes, and make clear that Safest's up-front figure is the fee alone. Read `node_modules/next/dist/docs/` on the relevant API before changing a server component boundary here.

- [ ] **Step 2: Build `deal-timeline.tsx`**

One list of steps from `DealView.steps`, each marked done, current or upcoming, with the actor's name on it. The current step renders its action button only when `viewerRole` matches that step's actor; step 6 of Safest renders a transaction-reference input bound to `completeStep`'s `paymentRef`. Both the holding steps display "Google's waiting period, usually about 7 days — our agent confirms it the moment it completes", since the spec forbids presenting it as a guaranteed date.

- [ ] **Step 3: Build the two pages**

`/dashboard/deals` lists the viewer's deals on both sides, like `src/app/(dashboard)/dashboard/messages/page.tsx`. `/dashboard/deals/[id]` calls `getDealFor(user.id, id)` and `notFound()` when it returns null, so guessing an id reveals nothing — the pattern at `src/app/(dashboard)/dashboard/messages/[id]/page.tsx:23`. Both set `robots: { index: false, follow: false }` in their metadata, matching the dashboard's other pages.

- [ ] **Step 4: Verify in the running app**

Run: `pnpm typecheck`, then drive one Safest deal through the UI against the dev server.
Expected: clean typecheck; each step's button appears only for the party that owns it, and the other side sees it greyed.

- [ ] **Step 5: Commit**

```bash
git add src/components/deals src/app/\(dashboard\)/dashboard/deals src/components/listing/buy-panel.tsx
git commit -m "feat: deal timeline and mode choice at checkout"
```

---

## Task 12: Admin and agent surfaces

**Files:**
- Create: `src/app/(admin)/admin/deals/page.tsx`
- Modify: `src/app/(admin)/layout.tsx`

**Interfaces:**
- Consumes: Task 9's `listDealActivity`; Task 10's `requireAdminArea`, `requireAgent`, `assignSelfAsAgent`, `approveStep`.
- Produces: nothing downstream.

- [ ] **Step 1: Make the admin shell role-aware**

Swap the layout's `requireStaff()` for `requireAdminArea()` and build `groups` from the signed-in role: an `AGENT` sees only Overview and Deals. Skip the moderation count queries for an agent — `getQueueCounts`, `countFlaggedThreads` and `countOpenTickets` feed badges they cannot act on. Every other admin page keeps `requireStaff()`, so an agent reaching one gets the deliberate 404.

- [ ] **Step 2: Build `/admin/deals`**

`requireAgent()` when `searchParams.agent === "me"`, otherwise `requireStaff()`. Three sections: the activity feed from `listDealActivity()`; a queue of orders needing an agent (`agentId: null`, status past `AWAITING_PAYMENT`) with an assign action; and a payments queue of orders in `AWAITING_PAYMENT` with a reference field calling `markOpeningPaymentReceived`, visible only to `FINANCE` and `SUPERADMIN`. Each row carries an end-deal control wired to `endDeal`, since that is how a stuck deal is cancelled, returned or refunded until Phase 2 automates the timers. Flag orders whose agent is banned as needing reassignment. Read the Next doc on `searchParams` in a page before using it — the signature differs from older versions.

- [ ] **Step 3: Verify both roles**

Run: `pnpm typecheck && pnpm test`, then sign in as an `AGENT` and as a `MODERATOR`.
Expected: the agent sees Deals only and 404s on `/admin/listings`; the moderator sees the full rail and the feed.

- [ ] **Step 4: Full verification**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: all green. `pnpm build` is the real gate — `next.config.ts` sets `typescript: { ignoreBuildErrors: false }`.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(admin\)
git commit -m "feat: admin deal feed and agent queue"
```

---

## Done when

- A Safest deal runs nine steps to `COMPLETED` with one `BUYER_FEE` ledger row and no row for the channel price.
- A Fastest deal runs six steps to `COMPLETED` leaving the seller's derived balance at the price less the seller fee.
- A buyer abandoning a Safest deal at the payment step leaves it `RETURNED_TO_SELLER`, the listing `LIVE` and the fee kept.
- No step can be completed by the wrong party, out of order, or on someone else's deal.
- `pnpm test`, `pnpm typecheck` and `pnpm build` all pass.
