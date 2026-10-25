import { expect, test, vi } from "vitest";

// The chime asks this every few seconds from every open tab. The queries are
// the notification module's own; this is the wiring and the shape.
const fake = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("@/server/session", () => ({
  getCurrentUser: async () => fake.user,
}));
vi.mock("@/server/notifications", () => ({
  unreadCount: async (userId: string) => (userId === "m1" ? 2 : 0),
  latestUnread: async (userId: string) =>
    userId === "m1"
      ? [
          {
            id: "n2",
            kind: "MESSAGE",
            href: "/dashboard/messages/c1",
            createdAt: new Date("2026-10-26T10:05:00.000Z"),
          },
          {
            id: "n1",
            kind: "OFFER",
            href: "/dashboard/offers",
            createdAt: new Date("2026-10-26T10:00:00.000Z"),
          },
        ]
      : [],
}));

test("a signed-in member gets the newest unread, uncached", async () => {
  fake.user = { id: "m1" };
  const { GET } = await import("@/app/api/notifications/pulse/route");

  const response = await GET();
  expect(response.headers.get("cache-control")).toMatch(/no-store/);
  const body = await response.json();
  expect(body).toMatchObject({
    unread: 2,
    latestId: "n2",
    latestAt: "2026-10-26T10:05:00.000Z",
    recent: [
      {
        id: "n2",
        kind: "MESSAGE",
        href: "/dashboard/messages/c1",
        at: "2026-10-26T10:05:00.000Z",
      },
      {
        id: "n1",
        kind: "OFFER",
        href: "/dashboard/offers",
        at: "2026-10-26T10:00:00.000Z",
      },
    ],
  });
  expect(Number.isNaN(Date.parse(body.now))).toBe(false);
});

test("nobody signed in gets zeros and nulls, and no error", async () => {
  fake.user = null;
  const { GET } = await import("@/app/api/notifications/pulse/route");

  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    unread: 0,
    latestId: null,
    latestAt: null,
    recent: [],
  });
});
