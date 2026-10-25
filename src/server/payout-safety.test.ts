import { afterEach, expect, test, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { ADDRESS_TYPO } from "@/lib/payout-address";
import { creditDeposit, setPayoutAddress } from "@/server/wallet";
import { seedUser, withCleanDb } from "@/test/db";

// QA, on the wallet and the payouts desk: a TRON address with one character
// wrong was saved, a changed address left no trace, the withdraw form looked
// ready during the 24-hour hold and its refusals named no figure, and "abc"
// settled a payout as its transaction hash.

type Fake = { id: string; role: UserRole } | null;
const fake = vi.hoisted(() => ({ user: null as Fake }));

vi.mock("@/server/session", () => {
  const notFound = () => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  };
  const current = () =>
    fake.user
      ? {
          id: fake.user.id,
          email: "someone@example.test",
          name: "Someone",
          image: null,
          emailVerified: true,
          role: fake.user.role,
          slug: null,
          banned: false,
        }
      : null;
  return {
    getCurrentUser: async () => current(),
    requireUser: async () => current() ?? notFound(),
    requireRole: async (...allowed: UserRole[]) => {
      const user = current();
      if (!user) return notFound();
      if (user.role !== "SUPERADMIN" && !allowed.includes(user.role)) {
        return notFound();
      }
      return user;
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

afterEach(() => {
  fake.user = null;
  vi.unstubAllEnvs();
});

const as = (user: { id: string; role: UserRole }) => {
  fake.user = { id: user.id, role: user.role };
};

const TRON = "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE";
const TRON_HASH = `${"ab".repeat(16)}${"0123456789abcdef".repeat(2)}`;

/** A day passes on the address's hold. */
async function liftHold(userId: string) {
  await db.payoutAddress.update({
    where: { userId },
    data: { lockedUntil: new Date(Date.now() - 1000) },
  });
}

test(
  "a mistyped address is refused and nothing is saved",
  withCleanDb(async () => {
    const { savePayoutAddress } = await import("@/server/actions/wallet");
    const user = await seedUser();
    as(user);

    expect(
      await savePayoutAddress("TJBjEh1hxvpCbtnTGU1KFbbBv9Eq6p9a1b", "TRON"),
    ).toEqual({ ok: false, error: ADDRESS_TYPO });
    expect(
      await savePayoutAddress(
        "0x52908400098527886E0F7030069857D2E4169EE7",
        "eth",
      ),
    ).toMatchObject({ ok: true });
    const saved = await db.payoutAddress.findUnique({
      where: { userId: user.id },
    });
    expect(saved?.network).toBe("ETH");
  }),
);

test(
  "adding and changing the address each leave a notice, and say when withdrawals open",
  withCleanDb(async () => {
    const { savePayoutAddress } = await import("@/server/actions/wallet");
    const user = await seedUser();
    as(user);

    const first = await savePayoutAddress(TRON, "TRON");
    expect(first).toMatchObject({
      ok: true,
      message: expect.stringContaining("Every new address waits 24 hours"),
    });
    const until = first.ok && first.until ? new Date(first.until) : null;
    expect(until?.getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);

    await liftHold(user.id);
    const changed = await savePayoutAddress(
      "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      "TRON",
    );
    expect(changed).toMatchObject({
      ok: true,
      message: expect.stringContaining("held for 24 hours after a change"),
      until: expect.any(String),
    });

    const notices = await db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { title: true, body: true, href: true },
    });
    expect(notices.map((n) => n.title)).toEqual([
      "Your payout address was added",
      "Your payout address was changed",
    ]);
    expect(notices[1]).toMatchObject({
      body: expect.stringContaining("TR7N…Lj6t"),
      href: "/dashboard/wallet",
    });
    expect(notices[1]?.body).toContain("If this wasn't you");

    // Saving the same one again is not a change, and says so.
    expect(
      await savePayoutAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", "TRON"),
    ).toEqual({
      ok: true,
      message: "That is already your payout address, so nothing changed.",
    });
    expect(await db.notification.count({ where: { userId: user.id } })).toBe(2);
  }),
);

test(
  "a withdrawal refused for the hold or the minimum says when, and how much",
  withCleanDb(async () => {
    const { requestPayout } = await import("@/server/actions/wallet");
    const user = await seedUser();
    as(user);
    await creditDeposit(user.id, 5_000, "dep-1", "USDT");
    await setPayoutAddress(user.id, TRON, "TRON");

    expect(await requestPayout(30)).toEqual({
      ok: false,
      error: expect.stringMatching(
        /^Your payout address is new, so withdrawals open in 2[34] hours\./,
      ),
    });

    await liftHold(user.id);
    expect(await requestPayout(10)).toEqual({
      ok: false,
      error: "The smallest withdrawal is $20.00.",
    });
    expect(await requestPayout(25)).toMatchObject({ ok: true });
  }),
);

test(
  "finance cannot settle a payout with a hash that is not one",
  withCleanDb(async () => {
    const { decidePayout } = await import("@/server/actions/wallet");
    const seller = await seedUser();
    const finance = await seedUser("FINANCE");
    await creditDeposit(seller.id, 5_000, "dep-1", "USDT");
    await setPayoutAddress(seller.id, TRON, "TRON");
    await liftHold(seller.id);
    const asked = await (await import("@/server/wallet")).requestWithdrawal(
      seller.id,
      3_000,
    );
    if (!asked.ok) throw new Error(asked.reason);

    as(finance);
    expect(await decidePayout(asked.withdrawalId, "SENT", "abc", "")).toEqual({
      ok: false,
      error:
        "That doesn't look like a TRON transaction hash. It is 64 characters, 0–9 and a–f, with no 0x.",
    });
    expect(
      await decidePayout(asked.withdrawalId, "SENT", `0x${TRON_HASH}`, ""),
    ).toMatchObject({ ok: false });
    const still = await db.withdrawal.findUniqueOrThrow({
      where: { id: asked.withdrawalId },
    });
    expect(still.status).toBe("REQUESTED");

    expect(
      await decidePayout(asked.withdrawalId, "SENT", ` ${TRON_HASH} `, ""),
    ).toEqual({ ok: true, message: "Marked as sent." });
    const sent = await db.withdrawal.findUniqueOrThrow({
      where: { id: asked.withdrawalId },
    });
    expect(sent).toMatchObject({ status: "SENT", txHash: TRON_HASH });

    // Refusing needs no hash at all.
    expect(
      await decidePayout("no-such-payout", "REJECTED", "", "Wrong network"),
    ).toMatchObject({ ok: false });
  }),
);

test(
  "with crypto top-ups off, the wallet says who to ask instead of promising a credit",
  withCleanDb(async () => {
    vi.stubEnv("CRYPTOMUS_MERCHANT_ID", "");
    vi.stubEnv("CRYPTOMUS_PAYMENT_KEY", "");
    const { startTopUp } = await import("@/server/actions/wallet");
    const user = await seedUser();
    as(user);

    const result = await startTopUp(250);
    expect(result).toMatchObject({
      ok: false,
      error: expect.not.stringContaining("credit your balance by hand"),
      help: { label: "Ask to add funds" },
    });
    const href = !result.ok && result.help ? result.help.href : "";
    const url = new URL(href, "https://channeladda.com");
    expect(url.pathname).toBe("/support");
    expect(url.searchParams.get("topic")).toBe("Payments or withdrawals");
    expect(url.searchParams.get("message")).toContain("$250");
  }),
);
