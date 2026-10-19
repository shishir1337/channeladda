import { expect, test, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

// The client's ask: each moderator keeps their own access email on file, so
// nobody types it per deal, and changes it whenever they need to.

const fake = vi.hoisted(() => ({ userId: "", role: "USER" as UserRole }));

vi.mock("@/server/session", () => ({
  requireRole: async (...allowed: UserRole[]) => {
    if (fake.role !== "SUPERADMIN" && !allowed.includes(fake.role)) {
      throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    }
    return { id: fake.userId, role: fake.role };
  },
  requireSuperadmin: async () => {
    if (fake.role !== "SUPERADMIN") {
      throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    }
    return { id: fake.userId, role: fake.role };
  },
  requireStaff: async () => ({ id: fake.userId, role: fake.role }),
  requireUser: async () => ({ id: fake.userId, role: fake.role }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

test(
  "a moderator sets their own access email, and the next deal they take uses it",
  withCleanDb(async () => {
    const moderator = await seedUser("MODERATOR");
    fake.userId = moderator.id;
    fake.role = "MODERATOR";
    const { setMyAgentIdentity } = await import("@/server/actions/admin-users");

    expect(
      await setMyAgentIdentity(
        "Mod.Desk@ChannelAdda.test",
        "Channel Adda Desk",
      ),
    ).toMatchObject({ ok: true });

    const { listing, buyer } = await seedListing();
    const { createDeal, recordOpeningPayment } = await import("@/server/deals");
    const created = await createDeal({
      listingId: listing.id,
      buyerId: buyer.id,
      mode: "SAFEST",
      acceptedRevenueRisk: true,
    });
    if (!created.ok) throw new Error(created.reason);
    await recordOpeningPayment(created.orderId, "pay-1", "USDT");

    const { claimDeal } = await import("@/server/actions/deals");
    expect(
      await claimDeal(created.orderId, "typed@example.test", "Typed"),
    ).toMatchObject({ ok: true });

    const order = await db.order.findUniqueOrThrow({
      where: { id: created.orderId },
    });
    expect(order.agentEmail).toBe("mod.desk@channeladda.test");
    expect(order.agentBrand).toBe("Channel Adda Desk");
  }),
);

test(
  "changing it later leaves a deal already running on the address its seller was given",
  withCleanDb(async () => {
    const agent = await seedUser("AGENT");
    fake.userId = agent.id;
    fake.role = "AGENT";
    const { setMyAgentIdentity } = await import("@/server/actions/admin-users");
    await setMyAgentIdentity("first@channeladda.test", "Channel Adda");

    const { listing, buyer } = await seedListing();
    const { createDeal, recordOpeningPayment } = await import("@/server/deals");
    const created = await createDeal({
      listingId: listing.id,
      buyerId: buyer.id,
      mode: "SAFEST",
      acceptedRevenueRisk: true,
    });
    if (!created.ok) throw new Error(created.reason);
    await recordOpeningPayment(created.orderId, "pay-2", "USDT");
    const { claimDeal } = await import("@/server/actions/deals");
    await claimDeal(created.orderId, "", "");

    expect(
      await setMyAgentIdentity("second@channeladda.test", "Channel Adda"),
    ).toMatchObject({ ok: true });

    const order = await db.order.findUniqueOrThrow({
      where: { id: created.orderId },
    });
    expect(order.agentEmail).toBe("first@channeladda.test");
    const me = await db.user.findUniqueOrThrow({ where: { id: agent.id } });
    expect(me.agentEmail).toBe("second@channeladda.test");
  }),
);

test(
  "a member cannot give themselves a transfer identity",
  withCleanDb(async () => {
    const member = await seedUser("USER");
    fake.userId = member.id;
    fake.role = "USER";
    const { setMyAgentIdentity } = await import("@/server/actions/admin-users");
    await expect(setMyAgentIdentity("me@example.test", "Me")).rejects.toThrow();
    const row = await db.user.findUniqueOrThrow({ where: { id: member.id } });
    expect(row.agentEmail).toBeNull();
  }),
);

test(
  "only the superadmin sets levels, and only on somebody who runs deals",
  withCleanDb(async () => {
    const admin = await seedUser("SUPERADMIN");
    const moderator = await seedUser("MODERATOR");
    const finance = await seedUser("FINANCE");
    const { setDealLevel } = await import("@/server/actions/admin-users");

    fake.userId = moderator.id;
    fake.role = "MODERATOR";
    await expect(setDealLevel(moderator.id, "FROM_100K")).rejects.toThrow();

    fake.userId = admin.id;
    fake.role = "SUPERADMIN";
    expect(await setDealLevel(moderator.id, "UNDER_100K")).toMatchObject({
      ok: true,
    });
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: moderator.id } }))
        .dealLevel,
    ).toBe("UNDER_100K");
    expect(await setDealLevel(finance.id, "UNDER_10K")).toMatchObject({
      ok: false,
    });
  }),
);
