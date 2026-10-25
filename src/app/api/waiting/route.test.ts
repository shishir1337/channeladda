import { expect, test, vi } from "vitest";

// The website's tab bar asks for these from the browser. The counts are the
// dashboard's own functions, tested where they live; this is the wiring.
const fake = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("@/server/session", () => ({
  getCurrentUser: async () => fake.user,
}));
vi.mock("@/server/deals", () => ({
  countDealsAwaiting: async (userId: string) => (userId === "m1" ? 2 : 0),
}));
vi.mock("@/server/messages", () => ({
  countUnreadThreads: async (userId: string) => (userId === "m1" ? 5 : 0),
}));

test("a signed-in member gets their deal and chat counts, uncached", async () => {
  fake.user = { id: "m1" };
  const { GET } = await import("@/app/api/waiting/route");

  const response = await GET();
  expect(response.headers.get("cache-control")).toMatch(/no-store/);
  expect(await response.json()).toEqual({ deals: 2, messages: 5 });
});

test("nobody signed in gets zeros, and no error", async () => {
  fake.user = null;
  const { GET } = await import("@/app/api/waiting/route");

  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ deals: 0, messages: 0 });
});
