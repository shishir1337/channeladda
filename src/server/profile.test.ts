import { randomBytes } from "node:crypto";
import { expect, test } from "vitest";
import { db } from "@/lib/db";
import { saveProfile } from "@/server/profile";
import { getSeller } from "@/server/sellers";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

// The owner: "its very hard to open profile and edit for anyone". A member
// changes their own name, country and photo — and only ever to a photo they
// uploaded themselves.

async function uploadAs(userId: string, kind: string) {
  const key = `${kind}/${randomBytes(16).toString("hex")}.png`;
  await db.upload.create({
    data: {
      key,
      uploaderId: userId,
      kind,
      bytes: 100,
      contentType: "image/png",
    },
  });
  return `/uploads/${key}`;
}

test(
  "a member saves their name, country and their own photo",
  withCleanDb(async () => {
    const member = await seedUser();
    const photo = await uploadAs(member.id, "avatar");

    const result = await saveProfile(member.id, {
      name: "Nadia Rahman",
      country: "Bangladesh",
      image: photo,
      bio: null,
    });

    expect(result).toEqual({ ok: true });
    expect(
      await db.user.findUniqueOrThrow({
        where: { id: member.id },
        select: { name: true, country: true, image: true },
      }),
    ).toEqual({ name: "Nadia Rahman", country: "Bangladesh", image: photo });
  }),
);

test(
  "a photo somebody else uploaded is refused, and nothing changes",
  withCleanDb(async () => {
    const member = await seedUser();
    const other = await seedUser();
    const theirs = await uploadAs(other.id, "avatar");

    const result = await saveProfile(member.id, {
      name: "Nadia Rahman",
      country: null,
      image: theirs,
      bio: null,
    });

    expect(result).toEqual({
      ok: false,
      errors: { image: "Choose your photo again." },
    });
    const after = await db.user.findUniqueOrThrow({
      where: { id: member.id },
      select: { name: true, image: true },
    });
    expect(after).toEqual({ name: member.name, image: null });
  }),
);

test(
  "keeping the photo already on the profile needs no new upload, and it can be removed",
  withCleanDb(async () => {
    const member = await seedUser();
    const photo = await uploadAs(member.id, "avatar");
    await db.user.update({ where: { id: member.id }, data: { image: photo } });
    // The upload row may be swept later; the photo on the profile stays valid.
    await db.upload.deleteMany({ where: { uploaderId: member.id } });

    expect(
      await saveProfile(member.id, {
        name: "Ravi",
        country: null,
        image: photo,
        bio: null,
      }),
    ).toEqual({ ok: true });

    expect(
      await saveProfile(member.id, {
        name: "Ravi",
        country: null,
        image: null,
        bio: null,
      }),
    ).toEqual({ ok: true });
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: member.id } })).image,
    ).toBeNull();
  }),
);

test(
  "a seller's bio is saved and shown on their public page",
  withCleanDb(async () => {
    const { seller } = await seedListing();
    const bio =
      "Faceless finance channels since 2019.\n\nEvery handover in a day.";
    expect(
      await saveProfile(seller.id, {
        name: "Test Seller",
        country: null,
        image: null,
        bio,
      }),
    ).toEqual({ ok: true });

    const page = await getSeller(seller.slug ?? "");
    expect(page?.bio).toBe(bio);

    // Cleared, it is gone from the page.
    await saveProfile(seller.id, {
      name: "Test Seller",
      country: null,
      image: null,
      bio: null,
    });
    expect((await getSeller(seller.slug ?? ""))?.bio).toBeNull();
  }),
);

test(
  "a saved profile photo is kept by the sweep of unused uploads",
  withCleanDb(async () => {
    // The sweep deletes uploads nothing points at a day after they were
    // sent. A profile photo is pointed at by the member, so saving it marks
    // it as in use.
    const member = await seedUser();
    const photo = await uploadAs(member.id, "avatar");
    const key = photo.replace("/uploads/", "");
    await db.upload.update({
      where: { key },
      data: { createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000) },
    });

    await saveProfile(member.id, {
      name: "Nadia Rahman",
      country: null,
      image: photo,
      bio: null,
    });
    expect(
      (await db.upload.findUniqueOrThrow({ where: { key } })).attachedAt,
    ).not.toBeNull();

    const { collectOrphanUploads } = await import("@/server/upload-access");
    await collectOrphanUploads();
    expect(await db.upload.findUnique({ where: { key } })).not.toBeNull();
  }),
);

test(
  "a profile photo saved before it was marked in use still survives",
  withCleanDb(async () => {
    // Photos saved before the mark existed are only known by the member
    // pointing at them, so the sweep checks that too before deleting.
    const member = await seedUser();
    const photo = await uploadAs(member.id, "avatar");
    const key = photo.replace("/uploads/", "");
    await db.upload.update({
      where: { key },
      data: { createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000) },
    });
    await db.user.update({ where: { id: member.id }, data: { image: photo } });

    const { collectOrphanUploads } = await import("@/server/upload-access");
    expect(await collectOrphanUploads()).toBe(0);
    expect(
      (await db.upload.findUniqueOrThrow({ where: { key } })).attachedAt,
    ).not.toBeNull();
  }),
);
