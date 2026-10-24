import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { DealMode, Platform } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/server/session";

/**
 * The certificate a completed deal earns: proof, for the buyer and the
 * seller, that an account changed hands through Channel Adda.
 *
 * It carries a code anyone can check on the website. The code is the deal's
 * reference and a signature of the deal, so it needs nothing stored and
 * cannot be made up: change a character and it no longer checks out. It
 * only checks out while the deal stands completed.
 */
export type Certificate = {
  code: string;
  reference: string;
  mode: DealMode;
  /** Cents. */
  priceUsd: number;
  platform: Platform;
  handle: string;
  title: string;
  sourceUrl: string | null;
  sellerName: string;
  buyerName: string;
  openedAt: Date;
  paidAt: Date | null;
  completedAt: Date;
};

/** No 0/O or 1/I, so a code read off paper is typed right. */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const TAG = /^[2-9A-HJ-NP-Z]{8}$/;

function secret(): string {
  // Its own secret when one is set; otherwise the auth secret, which every
  // deployment already has. Changing it voids every certificate's code.
  const value =
    process.env.CERTIFICATE_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error("No secret to sign certificates with.");
  return value;
}

/** Eight characters signing this deal: 40 bits of an HMAC over its id. */
export function certificateTag(orderId: string): string {
  const digest = createHmac("sha256", secret())
    .update(`certificate:v1:${orderId}`)
    .digest();
  let bits = 0;
  let value = 0;
  let tag = "";
  for (const byte of digest) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && tag.length < 8) {
      tag += ALPHABET[(value >> (bits - 5)) & 31];
      bits -= 5;
    }
    if (tag.length === 8) break;
  }
  return tag;
}

const certificateSelect = {
  id: true,
  reference: true,
  mode: true,
  status: true,
  priceUsd: true,
  createdAt: true,
  feePaidAt: true,
  paidAt: true,
  completedAt: true,
  buyer: { select: { name: true } },
  seller: { select: { name: true } },
  listing: {
    select: { platform: true, handle: true, title: true, sourceUrl: true },
  },
} satisfies Prisma.OrderSelect;

type Row = Prisma.OrderGetPayload<{ select: typeof certificateSelect }>;

function toCertificate(order: Row): Certificate | null {
  if (order.status !== "COMPLETED" || !order.completedAt) return null;
  return {
    code: `${order.reference}-${certificateTag(order.id)}`,
    reference: order.reference,
    mode: order.mode,
    priceUsd: order.priceUsd,
    platform: order.listing.platform,
    handle: order.listing.handle,
    title: order.listing.title,
    sourceUrl: order.listing.sourceUrl,
    sellerName: order.seller.name,
    buyerName: order.buyer.name,
    openedAt: order.createdAt,
    paidAt: order.feePaidAt ?? order.paidAt,
    completedAt: order.completedAt,
  };
}

/** The certificate for a deal, or null while it is not completed. */
export async function certificateFor(
  orderId: string,
): Promise<Certificate | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: certificateSelect,
  });
  return order ? toCertificate(order) : null;
}

/**
 * A certificate by its code, as typed by whoever is checking it, or null
 * when the code is wrong or the deal no longer stands completed.
 */
export async function verifyCertificate(
  code: string,
): Promise<Certificate | null> {
  // "CA-", or "DB-" on deals from before the rename.
  const match = /^([A-Z]{2}-[0-9A-Z]{3,12})-([0-9A-Z]{8})$/.exec(
    code.trim().toUpperCase(),
  );
  if (!match) return null;
  const [, reference, tag] = match;
  if (!TAG.test(tag)) return null;

  const order = await db.order.findFirst({
    where: { reference: { equals: reference, mode: "insensitive" } },
    select: certificateSelect,
  });
  if (!order) return null;

  const expected = Buffer.from(certificateTag(order.id));
  const given = Buffer.from(tag);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  return toCertificate(order);
}

/**
 * The buyer and the seller of a completed deal may download its
 * certificate. Staff see deals through the staff desk, not this.
 */
export async function canDownloadCertificate(
  user: CurrentUser,
  orderId: string,
): Promise<boolean> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { buyerId: true, sellerId: true, status: true },
  });
  if (order?.status !== "COMPLETED") return false;
  return order.buyerId === user.id || order.sellerId === user.id;
}
