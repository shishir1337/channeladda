import { expect, test, vi } from "vitest";
import { creditDeposit } from "@/server/wallet";
import { seedUser, withCleanDb } from "@/test/db";

// The site header asks for this from the browser: the pages it sits on are
// static, so who is looking cannot come from the page itself.
const fake = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("@/server/session", () => ({
  getCurrentUser: async () => fake.user,
}));

test(
  "a signed-in member gets their wallet balance",
  withCleanDb(async () => {
    const member = await seedUser();
    await creditDeposit(member.id, 19_010, "dep-header", "USDT");
    fake.user = { id: member.id };
    const { GET } = await import("@/app/api/wallet/route");

    const response = await GET();
    expect(response.headers.get("cache-control")).toMatch(/no-store/);
    expect(await response.json()).toEqual({ balanceUsd: 19_010 });
  }),
);

test(
  "nobody signed in gets nothing, and no error",
  withCleanDb(async () => {
    fake.user = null;
    const { GET } = await import("@/app/api/wallet/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ balanceUsd: null });
  }),
);
