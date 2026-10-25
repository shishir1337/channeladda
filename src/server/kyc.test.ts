import { randomBytes } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { Mail } from "@/server/mailer";
import { seedUser, withCleanDb } from "@/test/db";

// Getting verified (the owner, 2026-10-26): optional, only for the Verified
// badge. A member sends an ID and a selfie video, a moderator decides, and
// only an approved check shows the badge. The files are private.

type Fake = { id: string; role: UserRole; banned?: boolean } | null;
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
          banned: fake.user.banned ?? false,
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

const mail = vi.hoisted(() => ({ sent: [] as Mail[] }));
vi.mock("@/server/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/mailer")>()),
  canSendMail: () => true,
  sendMail: async (m: Mail) => {
    mail.sent.push(m);
  },
}));

afterEach(() => {
  fake.user = null;
  mail.sent.length = 0;
});

const as = (user: { id: string; role: UserRole }) => {
  fake.user = { id: user.id, role: user.role };
};

/** An upload this member made under `kyc`, as the upload route records it. */
async function kycUpload(
  uploaderId: string,
  ext: "jpg" | "png" | "mp4" = "jpg",
) {
  const key = `kyc/${randomBytes(16).toString("hex")}.${ext}`;
  const sha256 = randomBytes(32).toString("hex");
  await db.upload.create({
    data: {
      key,
      uploaderId,
      kind: "kyc",
      bytes: 1000,
      contentType: ext === "mp4" ? "video/mp4" : "image/jpeg",
      sha256,
    },
  });
  return { url: `/uploads/${key}`, key, sha256 };
}

async function member(name = "Asha Rao") {
  const user = await seedUser("USER");
  return db.user.update({
    where: { id: user.id },
    data: { name, slug: `asha-${randomBytes(4).toString("hex")}` },
  });
}

/** A complete form, with fresh uploads by this member. */
async function form(userId: string, overrides: Record<string, string> = {}) {
  const [front, back, video] = await Promise.all([
    kycUpload(userId),
    kycUpload(userId),
    kycUpload(userId, "mp4"),
  ]);
  return {
    fields: {
      documentType: "AADHAAR",
      fullName: "Asha Rao",
      country: "India",
      frontUrl: front.url,
      backUrl: back.url,
      videoUrl: video.url,
      ...overrides,
    },
    front,
    back,
    video,
  };
}

async function submitAs(userId: string, overrides?: Record<string, string>) {
  as({ id: userId, role: "USER" });
  const { submitVerification } = await import("@/server/actions/kyc");
  const sent = await form(userId, overrides);
  const result = await submitVerification(sent.fields);
  return { result, ...sent };
}

const allText = (rows: unknown) => JSON.stringify(rows);

test(
  "sending an ID check sets PENDING, and nothing about it names a file",
  withCleanDb(async () => {
    const asha = await member();
    const moderator = await seedUser("MODERATOR");

    const { result, front, back, video } = await submitAs(asha.id);
    expect(result).toMatchObject({ ok: true });

    const user = await db.user.findUniqueOrThrow({ where: { id: asha.id } });
    expect(user.kycStatus).toBe("PENDING");

    const submission = await db.kycSubmission.findUniqueOrThrow({
      where: { userId: asha.id },
    });
    expect(submission).toMatchObject({
      status: "PENDING",
      documentType: "AADHAAR",
      fullName: "Asha Rao",
      country: "India",
      documentUrl: front.url,
      documentBackUrl: back.url,
      videoUrl: video.url,
      // The server's hash of the front, never the browser's.
      documentHash: front.sha256,
      attempts: 1,
    });

    // Attached, so the orphan sweep leaves them alone.
    const uploads = await db.upload.findMany({
      where: { key: { in: [front.key, back.key, video.key] } },
    });
    expect(uploads.every((u) => u.attachedAt !== null)).toBe(true);

    // Moderators hear about it, with no file in sight.
    const told = await db.notification.findMany({
      where: { userId: moderator.id, kind: "IDENTITY" },
    });
    expect(told).toHaveLength(1);
    expect(told[0].href).toBe("/admin/verification");

    const audit = await db.auditLog.findMany({ where: { entity: "kyc" } });
    expect(audit.map((a) => a.action)).toEqual(["kyc.submit"]);
    for (const text of [allText(audit), allText(told)]) {
      expect(text).not.toContain("/uploads/");
      expect(text).not.toContain(front.key);
    }
  }),
);

test(
  "a second check while one is waiting is refused",
  withCleanDb(async () => {
    const asha = await member();
    const first = await submitAs(asha.id);
    expect(first.result).toMatchObject({ ok: true });

    const second = await submitAs(asha.id);
    expect(second.result).toMatchObject({ ok: false });
    if (second.result.ok) throw new Error("unreachable");
    expect(second.result.error).toMatch(/already checking/);

    const submission = await db.kycSubmission.findUniqueOrThrow({
      where: { userId: asha.id },
    });
    // The first one stands.
    expect(submission.documentUrl).toBe(first.front.url);
    expect(submission.attempts).toBe(1);
  }),
);

test(
  "nobody can send somebody else's files, or a file that is not an ID check",
  withCleanDb(async () => {
    const asha = await member();
    const mallory = await member("Mallory");
    const theirs = await kycUpload(asha.id);

    const stolen = await submitAs(mallory.id, { frontUrl: theirs.url });
    expect(stolen.result).toMatchObject({ ok: false });

    const cover = await submitAs(mallory.id, {
      frontUrl: `/uploads/cover/${"a".repeat(32)}.png`,
    });
    expect(cover.result).toMatchObject({
      ok: false,
      errors: { frontUrl: expect.any(String) },
    });

    const user = await db.user.findUniqueOrThrow({ where: { id: mallory.id } });
    expect(user.kycStatus).toBe("NOT_STARTED");
  }),
);

test(
  "approving shows the badge, keeps the document's hash, and tells them without a file",
  withCleanDb(async () => {
    const asha = await member();
    const moderator = await seedUser("MODERATOR");
    const { front } = await submitAs(asha.id);
    const { id } = await db.kycSubmission.findUniqueOrThrow({
      where: { userId: asha.id },
    });

    const { getSeller } = await import("@/server/sellers");
    expect((await getSeller(asha.slug as string))?.verified).toBe(false);

    as(moderator);
    const { approveVerification } = await import("@/server/actions/kyc");
    expect(await approveVerification(id)).toMatchObject({ ok: true });

    const user = await db.user.findUniqueOrThrow({ where: { id: asha.id } });
    expect(user.kycStatus).toBe("APPROVED");
    expect(user.kycDocHash).toBe(front.sha256);
    const submission = await db.kycSubmission.findUniqueOrThrow({
      where: { id },
    });
    expect(submission).toMatchObject({
      status: "APPROVED",
      reviewerId: moderator.id,
    });

    // The badge.
    expect((await getSeller(asha.slug as string))?.verified).toBe(true);

    const told = await db.notification.findMany({
      where: { userId: asha.id, kind: "IDENTITY" },
    });
    expect(told).toHaveLength(1);
    expect(told[0].title).toBe("You're verified");
    expect(mail.sent.map((m) => m.subject)).toContain(
      "You're verified on Channel Adda",
    );

    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "kyc.approve" },
    });
    expect(audit.actorId).toBe(moderator.id);
    for (const text of [allText(told), allText(mail.sent), allText(audit)]) {
      expect(text).not.toContain("/uploads/");
    }

    // Decided once: a second decision is refused, not repeated.
    expect(await approveVerification(id)).toMatchObject({ ok: false });
  }),
);

test(
  "not approving needs a reason, which they read, and they can send again",
  withCleanDb(async () => {
    const asha = await member();
    const moderator = await seedUser("MODERATOR");
    const first = await submitAs(asha.id);
    const { id } = await db.kycSubmission.findUniqueOrThrow({
      where: { userId: asha.id },
    });

    as(moderator);
    const { rejectVerification } = await import("@/server/actions/kyc");
    expect(await rejectVerification(id, "blurry")).toMatchObject({
      ok: false,
    });
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: asha.id } })).kycStatus,
    ).toBe("PENDING");

    expect(
      await rejectVerification(id, "The photo of your ID is blurry"),
    ).toMatchObject({ ok: true });

    const { getMyVerification } = await import("@/server/kyc");
    const mine = await getMyVerification(asha.id);
    expect(mine.status).toBe("REJECTED");
    expect(mine.reason).toBe("The photo of your ID is blurry.");

    const told = await db.notification.findFirstOrThrow({
      where: { userId: asha.id, kind: "IDENTITY" },
    });
    expect(told.title).toBe("We couldn't verify you");
    expect(told.body).toBe(
      "The photo of your ID is blurry. You can try again.",
    );
    const email = mail.sent.find(
      (m) => m.subject === "We couldn't verify your ID",
    );
    expect(email?.body).toContain(
      "We couldn't verify you: The photo of your ID is blurry.",
    );
    expect(allText(mail.sent)).not.toContain("/uploads/");

    // No badge, and they can try again.
    const { getSeller } = await import("@/server/sellers");
    expect((await getSeller(asha.slug as string))?.verified).toBe(false);

    const again = await submitAs(asha.id);
    expect(again.result).toMatchObject({ ok: true });
    const resent = await db.kycSubmission.findUniqueOrThrow({
      where: { userId: asha.id },
    });
    expect(resent).toMatchObject({
      id,
      status: "PENDING",
      attempts: 2,
      reviewNote: null,
      documentUrl: again.front.url,
    });
    // The rejected try's files are gone.
    expect(
      await db.upload.findUnique({ where: { key: first.front.key } }),
    ).toBeNull();
    expect(
      await db.upload.findUnique({ where: { key: again.front.key } }),
    ).not.toBeNull();
  }),
);

test(
  "only a moderator or the superadmin decides; finance, agents and members cannot",
  withCleanDb(async () => {
    const asha = await member();
    await submitAs(asha.id);
    const { id } = await db.kycSubmission.findUniqueOrThrow({
      where: { userId: asha.id },
    });
    const { approveVerification, rejectVerification } = await import(
      "@/server/actions/kyc"
    );

    for (const role of ["FINANCE", "AGENT", "USER"] as const) {
      as(await seedUser(role));
      await expect(approveVerification(id)).rejects.toThrow(/404/);
      await expect(
        rejectVerification(id, "The photo of your ID is blurry"),
      ).rejects.toThrow(/404/);
    }
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: asha.id } })).kycStatus,
    ).toBe("PENDING");

    // Nobody decides their own.
    const moderator = await seedUser("MODERATOR");
    as(moderator);
    const own = await submitAs(moderator.id);
    expect(own.result).toMatchObject({ ok: true });
    const { id: ownId } = await db.kycSubmission.findUniqueOrThrow({
      where: { userId: moderator.id },
    });
    as(moderator);
    expect(await approveVerification(ownId)).toMatchObject({ ok: false });

    as(await seedUser("SUPERADMIN"));
    expect(await approveVerification(id)).toMatchObject({ ok: true });
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: asha.id } })).kycStatus,
    ).toBe("APPROVED");
  }),
);

test(
  "the manual control and the queue agree",
  withCleanDb(async () => {
    const asha = await member();
    await submitAs(asha.id);
    const { countPendingKyc } = await import("@/server/kyc");
    expect(await countPendingKyc()).toBe(1);

    as(await seedUser("MODERATOR"));
    const { setUserKyc } = await import("@/server/actions/admin-users");
    expect(
      await setUserKyc(asha.id, "APPROVED", "Passport matched on a video call"),
    ).toMatchObject({ ok: true });

    expect(await countPendingKyc()).toBe(0);
    const submission = await db.kycSubmission.findUniqueOrThrow({
      where: { userId: asha.id },
    });
    expect(submission.status).toBe("APPROVED");
    // The staff note is not the member's to read.
    expect(submission.reviewNote).toBeNull();
    const user = await db.user.findUniqueOrThrow({ where: { id: asha.id } });
    expect(user.kycDocHash).toBe(submission.documentHash);
  }),
);

test(
  "the review screen points out the same document on a suspended account",
  withCleanDb(async () => {
    const banned = await member("Old Account");
    const asha = await member();
    const { front } = await submitAs(asha.id);
    await db.user.update({
      where: { id: banned.id },
      data: {
        kycDocHash: front.sha256,
        bannedAt: new Date(),
        banReason: "Fraud",
      },
    });
    const { id } = await db.kycSubmission.findUniqueOrThrow({
      where: { userId: asha.id },
    });

    const { getKycReview, listKycQueue } = await import("@/server/kyc");
    const review = await getKycReview(id);
    expect(review?.sameDocument).toEqual([
      expect.objectContaining({
        userId: banned.id,
        banned: true,
        banReason: "Fraud",
      }),
    ]);
    const [row] = await listKycQueue("PENDING");
    expect(row).toMatchObject({ id, duplicate: true });
  }),
);

test(
  "an ID check's file reaches its owner and ID reviewers, and nobody else",
  withCleanDb(async () => {
    const { putUpload, deleteUpload } = await import("@/server/storage");
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      randomBytes(64),
    ]);
    const stored = await putUpload(
      new File([png], "aadhaar.png", { type: "image/png" }),
      "kyc",
    );
    try {
      const asha = await member();
      await db.upload.create({
        data: {
          key: stored.key,
          uploaderId: asha.id,
          kind: "kyc",
          bytes: stored.bytes,
          contentType: stored.contentType,
          sha256: stored.sha256,
        },
      });
      const { GET } = await import("@/app/uploads/[...path]/route");
      const fetchAs = async (who: Fake, range?: string) => {
        fake.user = who;
        return GET(
          new Request(`http://localhost${stored.url}`, {
            headers: range ? { range } : {},
          }),
          { params: Promise.resolve({ path: stored.key.split("/") }) },
        );
      };

      const stranger = await member("Stranger");
      const finance = await seedUser("FINANCE");
      const agent = await seedUser("AGENT");
      for (const who of [
        null,
        { id: stranger.id, role: "USER" as const },
        { id: finance.id, role: finance.role },
        { id: agent.id, role: agent.role },
        { id: asha.id, role: "USER" as const, banned: true },
      ]) {
        expect((await fetchAs(who)).status).toBe(404);
      }

      const moderator = await seedUser("MODERATOR");
      const superadmin = await seedUser("SUPERADMIN");
      for (const who of [
        { id: asha.id, role: "USER" as const },
        { id: moderator.id, role: moderator.role },
        { id: superadmin.id, role: superadmin.role },
      ]) {
        const response = await fetchAs(who);
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
      }

      // A range, as a <video> on an iPhone asks for one.
      const part = await fetchAs({ id: asha.id, role: "USER" }, "bytes=0-7");
      expect(part.status).toBe(206);
      expect(part.headers.get("content-range")).toBe(
        `bytes 0-7/${png.byteLength}`,
      );
      expect(Buffer.from(await part.arrayBuffer())).toEqual(png.subarray(0, 8));
    } finally {
      await deleteUpload(stored.key);
    }
  }),
);

test("a video is a legal ID check upload, a GIF is not", async () => {
  const { putUpload, deleteUpload, UploadError } = await import(
    "@/server/storage"
  );
  const mp4 = Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]),
    Buffer.from("ftypisom", "latin1"),
    randomBytes(32),
  ]);
  const clip = await putUpload(new File([mp4], "me.mp4"), "kyc");
  expect(clip).toMatchObject({ contentType: "video/mp4" });
  expect(clip.key).toMatch(/^kyc\/[0-9a-f]{32}\.mp4$/);
  await deleteUpload(clip.key);

  const gif = Buffer.concat([Buffer.from("GIF89a", "latin1"), randomBytes(16)]);
  await expect(putUpload(new File([gif], "id.gif"), "kyc")).rejects.toThrow(
    UploadError,
  );
  // And a clip is still refused where it never belonged.
  await expect(putUpload(new File([mp4], "me.mp4"), "proof")).rejects.toThrow(
    UploadError,
  );
});

test(
  "the seller pages show the badge only for an approved ID check",
  withCleanDb(async () => {
    const { getSeller, getSellers } = await import("@/server/sellers");
    for (const status of ["NOT_STARTED", "PENDING", "REJECTED"] as const) {
      const someone = await member(`Seller ${status}`);
      await db.user.update({
        where: { id: someone.id },
        data: { kycStatus: status },
      });
      expect((await getSeller(someone.slug as string))?.verified).toBe(false);
    }

    const approved = await member("Approved Seller");
    await db.user.update({
      where: { id: approved.id },
      data: { kycStatus: "APPROVED" },
    });
    expect((await getSeller(approved.slug as string))?.verified).toBe(true);
    const listed = await getSellers();
    expect(listed.find((s) => s.slug === approved.slug)?.verified).toBe(true);
  }),
);
