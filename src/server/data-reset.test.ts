import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { planReset, resetData } from "@/server/data-reset";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

// The owner, 2026-10-26, before launch: every test account and everything
// done with them goes; the staff stay, able to sign in as before.

async function signInRow(userId: string, providerId = "credential") {
  await db.account.create({
    data: {
      userId,
      accountId: userId,
      providerId,
      password: providerId === "credential" ? "hashed" : null,
    },
  });
  await db.session.create({
    data: {
      userId,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
}

test(
  "a reset leaves the staff and nothing else",
  withCleanDb(async () => {
    const { listing, buyer, seller } = await seedListing();
    const admin = await seedUser("SUPERADMIN");
    const agent = await seedUser("AGENT");
    await db.user.update({
      where: { id: agent.id },
      data: {
        image: `/uploads/avatar/${"e".repeat(32)}.png`,
        kycStatus: "APPROVED",
        kycDocHash: "abc",
        agentEmail: "agent@channeladda.com",
      },
    });
    for (const user of [buyer, seller, admin, agent]) await signInRow(user.id);
    await db.notification.create({
      data: { userId: buyer.id, kind: "ORDER", title: "Hi", body: "Test" },
    });
    await db.upload.create({
      data: {
        key: `cover/${"f".repeat(32)}.png`,
        uploaderId: seller.id,
        kind: "cover",
        bytes: 10,
        contentType: "image/png",
      },
    });

    // The listing's agent, the admin and the second agent: every member of
    // staff, whoever seeded them.
    const staff = await db.user.findMany({
      where: { role: { not: "USER" } },
      select: { id: true, role: true },
    });
    const plan = await planReset();
    expect(plan.membersDeleted).toBe(2);
    expect(plan.staffKept).toEqual(
      expect.arrayContaining([
        { role: "SUPERADMIN", count: 1 },
        {
          role: "AGENT",
          count: staff.filter((u) => u.role === "AGENT").length,
        },
      ]),
    );
    expect(plan.wiped.find((t) => t.table === "Listing")?.rows).toBe(1);
    // Nothing changed by looking.
    expect(await db.listing.count()).toBe(1);

    await resetData();

    expect(
      (await db.user.findMany({ select: { id: true } }))
        .map((u) => u.id)
        .sort(),
    ).toEqual(staff.map((u) => u.id).sort());
    expect(staff.map((u) => u.id)).toEqual(
      expect.arrayContaining([admin.id, agent.id]),
    );
    // Still able to sign in: their passwords and Google links stay.
    expect(await db.account.count()).toBe(2);
    // Everybody signs in again.
    expect(await db.session.count()).toBe(0);
    expect(await db.listing.count()).toBe(0);
    expect(await db.order.count()).toBe(0);
    expect(await db.notification.count()).toBe(0);
    expect(await db.upload.count()).toBe(0);
    // Settings go back to the defaults, 5% included.
    expect(await db.platformSettings.count()).toBe(0);
    expect(listing.id).toBeTruthy();

    // A staff member's photo was an upload, and the uploads are gone; their
    // ID check went with the rest. The agent's transfer identity stays.
    const after = await db.user.findUniqueOrThrow({ where: { id: agent.id } });
    expect(after).toMatchObject({
      image: null,
      kycStatus: "NOT_STARTED",
      kycDocHash: null,
      agentEmail: "agent@channeladda.com",
    });
  }),
);

test(
  "a Google photo on a staff account is not an upload, and stays",
  withCleanDb(async () => {
    const admin = await seedUser("SUPERADMIN");
    const photo = "https://lh3.googleusercontent.com/a/x=s256-c";
    await db.user.update({ where: { id: admin.id }, data: { image: photo } });
    await resetData();
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: admin.id } })).image,
    ).toBe(photo);
  }),
);
