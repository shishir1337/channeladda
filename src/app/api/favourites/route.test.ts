import { expect, test, vi } from "vitest";

// The heart on every card asks for this from the browser.
const fake = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("@/server/session", () => ({
  getCurrentUser: async () => fake.user,
}));
vi.mock("@/server/favourites", () => ({
  getFavouriteIds: async () => ["listing-1", "listing-2"],
  toggleFavourite: async () => ({ ok: true, favourited: true }),
}));

test("a member's saved listings are never cached", async () => {
  fake.user = { id: "member-1" };
  const { GET } = await import("@/app/api/favourites/route");
  const response = await GET();
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ ids: ["listing-1", "listing-2"] });
});

test("nobody signed in gets an empty list, also uncached", async () => {
  fake.user = null;
  const { GET } = await import("@/app/api/favourites/route");
  const response = await GET();
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ ids: [] });
});
