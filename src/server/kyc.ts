import "server-only";

import type {
  KycDocument,
  KycStatus,
  UserRole,
} from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import {
  asSentence,
  KYC_REASON_MAX,
  KYC_REASON_MIN,
  type KycValues,
} from "@/lib/kyc";
import { keyFromUrl } from "@/lib/upload-keys";
import { type GuardFailure, setKycStatus } from "@/server/admin-users";
import { notify } from "@/server/notifications";
import { deleteUpload } from "@/server/storage";
import { markUploadsAttached } from "@/server/upload-access";

/**
 * Getting verified, end to end: a member sends an ID and a selfie video, a
 * moderator looks at them and decides, and only an approved check shows the
 * Verified badge. It is optional (the owner, 2026-10-26) and nothing else on
 * the site waits on it.
 *
 * The files are private `kyc/` uploads (`canReadUpload`). Nothing here puts
 * their URLs anywhere but the KycSubmission row: not in a notification, an
 * email, an audit row or a log.
 */

// ------------------------------------------------------------- the member

export type MyVerification = {
  status: KycStatus;
  /** Why it was not approved, as the reviewer wrote it for them. */
  reason: string | null;
  documentType: KycDocument | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
};

export async function getMyVerification(
  userId: string,
): Promise<MyVerification> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      kycStatus: true,
      kycSubmission: {
        select: {
          status: true,
          reviewNote: true,
          documentType: true,
          submittedAt: true,
          reviewedAt: true,
        },
      },
    },
  });
  const sub = user.kycSubmission;
  return {
    status: user.kycStatus,
    reason:
      user.kycStatus === "REJECTED" && sub?.status === "REJECTED"
        ? sub.reviewNote
        : null,
    documentType: sub?.documentType ?? null,
    submittedAt: sub?.submittedAt ?? null,
    reviewedAt: sub?.reviewedAt ?? null,
  };
}

export type SubmitFailure =
  /** A check is already waiting: they cannot send another. */
  | "pending"
  /** Already verified. */
  | "approved"
  /** A file is missing, is not theirs, or is not an ID check upload. */
  | "files";

/** Thrown inside the transaction when the status moved under us. */
class AlreadyMoved extends Error {
  constructor(readonly status: KycStatus) {
    super(status);
  }
}

/**
 * Sends an ID check. Allowed from NOT_STARTED and REJECTED only: while one
 * is waiting a second is refused, and after a rejection they may try again.
 *
 * Every file must be an upload this member made under `kyc`, so nobody can
 * point their check at somebody else's photos. The document hash is the one
 * the server worked out when the front was stored, never the browser's.
 *
 * Sending again replaces the last try, and that try's files are deleted: a
 * rejected photo of somebody's ID has no reason to stay on disk.
 */
export async function submitKyc(
  userId: string,
  value: KycValues,
): Promise<
  | { ok: true; submissionId: string; attempts: number }
  | { ok: false; reason: SubmitFailure }
> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { kycStatus: true },
  });
  if (!user) return { ok: false, reason: "files" };
  if (user.kycStatus === "PENDING") return { ok: false, reason: "pending" };
  if (user.kycStatus === "APPROVED") return { ok: false, reason: "approved" };

  const urls = [value.frontUrl, value.backUrl, value.videoUrl].filter(
    (url): url is string => Boolean(url),
  );
  const keys = urls.map((url) => keyFromUrl(url));
  if (keys.some((key) => key === null) || new Set(keys).size !== keys.length) {
    return { ok: false, reason: "files" };
  }

  const uploads = await db.upload.findMany({
    where: { key: { in: keys as string[] } },
    select: { key: true, uploaderId: true, kind: true, sha256: true },
  });
  const mine = new Map(
    uploads
      .filter((u) => u.uploaderId === userId && u.kind === "kyc")
      .map((u) => [u.key, u]),
  );
  if (keys.some((key) => !mine.has(key as string))) {
    return { ok: false, reason: "files" };
  }
  const documentHash =
    mine.get(keyFromUrl(value.frontUrl) as string)?.sha256 ?? null;

  const previous = await db.kycSubmission.findUnique({
    where: { userId },
    select: {
      documentUrl: true,
      documentBackUrl: true,
      videoUrl: true,
      selfieUrl: true,
    },
  });

  const fields = {
    status: "PENDING" as const,
    documentType: value.documentType,
    documentUrl: value.frontUrl,
    documentBackUrl: value.backUrl,
    documentHash,
    videoUrl: value.videoUrl,
    selfieUrl: null,
    fullName: value.fullName,
    country: value.country,
  };

  let saved: { id: string; attempts: number };
  try {
    saved = await db.$transaction(async (tx) => {
      // Compare-and-set, so a double tap or two tabs send one check.
      const moved = await tx.user.updateMany({
        where: { id: userId, kycStatus: { in: ["NOT_STARTED", "REJECTED"] } },
        data: { kycStatus: "PENDING" },
      });
      if (moved.count !== 1) {
        const now = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { kycStatus: true },
        });
        throw new AlreadyMoved(now.kycStatus);
      }
      return tx.kycSubmission.upsert({
        where: { userId },
        create: { userId, ...fields },
        update: {
          ...fields,
          attempts: { increment: 1 },
          reviewerId: null,
          reviewNote: null,
          reviewedAt: null,
          submittedAt: new Date(),
        },
        select: { id: true, attempts: true },
      });
    });
  } catch (error) {
    if (error instanceof AlreadyMoved) {
      return {
        ok: false,
        reason: error.status === "APPROVED" ? "approved" : "pending",
      };
    }
    throw error;
  }

  await markUploadsAttached(urls);

  // The last try's files, unless this one reuses them.
  const stale = [
    previous?.documentUrl,
    previous?.documentBackUrl,
    previous?.videoUrl,
    previous?.selfieUrl,
  ]
    .filter((url): url is string => Boolean(url) && !urls.includes(url ?? ""))
    .map((url) => keyFromUrl(url))
    .filter((key): key is string => key?.startsWith("kyc/") === true);
  for (const key of stale) {
    try {
      await deleteUpload(key);
      await db.upload.deleteMany({ where: { key } });
    } catch (error) {
      // Not named, even by key: see the note at the top.
      console.error(
        `[kyc] could not delete an old file for submission ${saved.id}`,
        error,
      );
    }
  }

  return { ok: true, submissionId: saved.id, attempts: saved.attempts };
}

// ------------------------------------------------------------- the queue

export type KycQueueStatus = "PENDING" | "APPROVED" | "REJECTED";

export type KycQueueItem = {
  id: string;
  userId: string;
  accountName: string;
  email: string;
  fullName: string;
  country: string;
  documentType: KycDocument | null;
  submittedAt: Date;
  reviewedAt: Date | null;
  attempts: number;
  banned: boolean;
  /** The same document is on another account. */
  duplicate: boolean;
};

/**
 * Waiting checks oldest first, so nobody sits at the bottom for ever.
 * Decided ones newest first, for looking back.
 */
export async function listKycQueue(
  status: KycQueueStatus = "PENDING",
  take = 100,
): Promise<KycQueueItem[]> {
  const rows = await db.kycSubmission.findMany({
    where: { status },
    orderBy:
      status === "PENDING" ? { submittedAt: "asc" } : { reviewedAt: "desc" },
    take,
    select: {
      id: true,
      userId: true,
      fullName: true,
      country: true,
      documentType: true,
      documentHash: true,
      submittedAt: true,
      reviewedAt: true,
      attempts: true,
      user: { select: { name: true, email: true, bannedAt: true } },
    },
  });

  const hashes = [
    ...new Set(
      rows.map((r) => r.documentHash).filter((h): h is string => Boolean(h)),
    ),
  ];
  const [onUsers, onSubmissions] =
    hashes.length > 0
      ? await Promise.all([
          db.user.findMany({
            where: { kycDocHash: { in: hashes } },
            select: { id: true, kycDocHash: true },
          }),
          db.kycSubmission.findMany({
            where: { documentHash: { in: hashes } },
            select: { userId: true, documentHash: true },
          }),
        ])
      : [[], []];
  const holders = new Map<string, Set<string>>();
  for (const [hash, userId] of [
    ...onUsers.map((u) => [u.kycDocHash, u.id] as const),
    ...onSubmissions.map((s) => [s.documentHash, s.userId] as const),
  ]) {
    if (!hash) continue;
    const set = holders.get(hash) ?? new Set<string>();
    set.add(userId);
    holders.set(hash, set);
  }

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    accountName: row.user.name,
    email: row.user.email,
    fullName: row.fullName,
    country: row.country,
    documentType: row.documentType,
    submittedAt: row.submittedAt,
    reviewedAt: row.reviewedAt,
    attempts: row.attempts,
    banned: row.user.bannedAt !== null,
    duplicate: row.documentHash
      ? [...(holders.get(row.documentHash) ?? [])].some(
          (id) => id !== row.userId,
        )
      : false,
  }));
}

export async function countKycByStatus(): Promise<
  Record<KycQueueStatus, number>
> {
  const groups = await db.kycSubmission.groupBy({
    by: ["status"],
    where: { status: { in: ["PENDING", "APPROVED", "REJECTED"] } },
    _count: { _all: true },
  });
  const counts: Record<KycQueueStatus, number> = {
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
  };
  for (const group of groups) {
    counts[group.status as KycQueueStatus] = group._count._all;
  }
  return counts;
}

/** The staff nav's count: checks waiting on a moderator. */
export async function countPendingKyc(): Promise<number> {
  return db.kycSubmission.count({ where: { status: "PENDING" } });
}

export type SameDocument = {
  userId: string;
  name: string;
  email: string;
  banned: boolean;
  /** Why they were suspended, when they were. */
  banReason: string | null;
  kycStatus: KycStatus;
};

export type KycReview = {
  id: string;
  status: KycStatus;
  documentType: KycDocument | null;
  fullName: string;
  country: string;
  /** Private `/uploads/kyc/...` URLs, for the review page and nothing else. */
  frontUrl: string;
  backUrl: string | null;
  videoUrl: string | null;
  attempts: number;
  submittedAt: Date;
  reviewedAt: Date | null;
  reviewNote: string | null;
  reviewerName: string | null;
  member: {
    id: string;
    name: string;
    email: string;
    country: string | null;
    role: UserRole;
    slug: string | null;
    joinedAt: Date;
    banned: boolean;
    kycStatus: KycStatus;
  };
  /** Other accounts the same document has been seen on. */
  sameDocument: SameDocument[];
};

export async function getKycReview(id: string): Promise<KycReview | null> {
  const row = await db.kycSubmission.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      documentType: true,
      fullName: true,
      country: true,
      documentUrl: true,
      documentBackUrl: true,
      documentHash: true,
      videoUrl: true,
      selfieUrl: true,
      attempts: true,
      submittedAt: true,
      reviewedAt: true,
      reviewNote: true,
      reviewerId: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          country: true,
          role: true,
          slug: true,
          createdAt: true,
          bannedAt: true,
          kycStatus: true,
        },
      },
    },
  });
  if (!row) return null;

  const [reviewer, sameDocument] = await Promise.all([
    row.reviewerId
      ? db.user.findUnique({
          where: { id: row.reviewerId },
          select: { name: true },
        })
      : null,
    row.documentHash ? sameDocumentAs(row.documentHash, row.user.id) : [],
  ]);

  return {
    id: row.id,
    status: row.status,
    documentType: row.documentType,
    fullName: row.fullName,
    country: row.country,
    frontUrl: row.documentUrl,
    backUrl: row.documentBackUrl,
    videoUrl: row.videoUrl ?? row.selfieUrl,
    attempts: row.attempts,
    submittedAt: row.submittedAt,
    reviewedAt: row.reviewedAt,
    reviewNote: row.reviewNote,
    reviewerName: reviewer?.name ?? null,
    member: {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      country: row.user.country,
      role: row.user.role,
      slug: row.user.slug,
      joinedAt: row.user.createdAt,
      banned: row.user.bannedAt !== null,
      kycStatus: row.user.kycStatus,
    },
    sameDocument,
  };
}

/**
 * Every other account this document has been seen on: approved onto one
 * (`User.kycDocHash`) or sent by one. A suspended account first, because
 * that is the case the hash exists for.
 *
 * The hash is of the file's bytes, so this finds the same photo sent twice,
 * not a new photo of the same card.
 */
export async function sameDocumentAs(
  hash: string,
  exceptUserId: string,
): Promise<SameDocument[]> {
  const people = await db.user.findMany({
    where: {
      id: { not: exceptUserId },
      OR: [{ kycDocHash: hash }, { kycSubmission: { documentHash: hash } }],
    },
    select: {
      id: true,
      name: true,
      email: true,
      bannedAt: true,
      banReason: true,
      kycStatus: true,
    },
    take: 20,
  });
  return people
    .map((p) => ({
      userId: p.id,
      name: p.name,
      email: p.email,
      banned: p.bannedAt !== null,
      banReason: p.banReason,
      kycStatus: p.kycStatus,
    }))
    .sort((a, b) => Number(b.banned) - Number(a.banned));
}

// ------------------------------------------------------------ deciding

export type DecideFailure =
  | GuardFailure
  /** Somebody else decided it first, or it was never waiting. */
  | "decided"
  | "reason-too-short"
  | "reason-too-long";

/**
 * Approve or turn down a waiting check.
 *
 * Through `setKycStatus`, the same write the manual control on the account
 * page uses, so the two can never disagree. Only MODERATOR and SUPERADMIN
 * get here — the action checks the role — and nobody decides their own.
 *
 * The member is told in the app and by email: that they are verified, or
 * what to fix. Neither message carries a file or a link to one.
 */
export async function decideKyc(input: {
  actorId: string;
  actorRole: UserRole;
  submissionId: string;
  approve: boolean;
  reason?: string;
}): Promise<
  | {
      ok: true;
      userId: string;
      slug: string | null;
      before: KycStatus;
      after: KycStatus;
      reason: string | null;
    }
  | { ok: false; reason: DecideFailure }
> {
  const submission = await db.kycSubmission.findUnique({
    where: { id: input.submissionId },
    select: {
      id: true,
      userId: true,
      status: true,
      user: { select: { slug: true } },
    },
  });
  if (!submission) return { ok: false, reason: "not-found" };
  if (submission.status !== "PENDING") return { ok: false, reason: "decided" };

  const reason = input.approve ? null : asSentence(input.reason ?? "");
  if (!input.approve) {
    if (!reason || reason.length < KYC_REASON_MIN) {
      return { ok: false, reason: "reason-too-short" };
    }
    if (reason.length > KYC_REASON_MAX) {
      return { ok: false, reason: "reason-too-long" };
    }
  }

  const result = await setKycStatus({
    actorId: input.actorId,
    actorRole: input.actorRole,
    userId: submission.userId,
    status: input.approve ? "APPROVED" : "REJECTED",
    reason: reason ?? "Approved from the review queue",
    memberNote: reason,
    submissionId: submission.id,
  });
  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason === "no-change" ? "decided" : result.reason,
    };
  }

  await notify(
    input.approve
      ? {
          userId: submission.userId,
          kind: "IDENTITY",
          title: "You're verified",
          body: "The Verified badge now shows beside your name.",
          href: "/dashboard/verification",
          email: {
            subject: "You're verified on Channel Adda",
            body: "Our team has checked your ID. The Verified badge now shows beside your name on your public page and on your listings.",
          },
        }
      : {
          userId: submission.userId,
          kind: "IDENTITY",
          title: "We couldn't verify you",
          body: `${reason} You can try again.`,
          href: "/dashboard/verification",
          email: {
            subject: "We couldn't verify your ID",
            body: [
              `We couldn't verify you: ${reason}`,
              "",
              "You can try again. Open Verification in your dashboard and send your ID and video again.",
            ].join("\n"),
          },
        },
  );

  return {
    ok: true,
    userId: submission.userId,
    slug: submission.user.slug,
    before: result.before,
    after: result.after,
    reason,
  };
}
