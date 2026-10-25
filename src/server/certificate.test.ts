import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { db } from "@/lib/db";
import {
  canDownloadCertificate,
  certificateFor,
  verifyCertificate,
} from "@/server/certificate";
import type { CurrentUser } from "@/server/session";
import { seedListing, seedUser, withCleanDb } from "@/test/db";

// The owner: after a deal completes, a certificate the buyer can download
// and show "if anything happens". It is only worth showing if somebody
// else can check it, so its code is checked against the deal itself.

async function seedDeal(status: "COMPLETED" | "IN_CUSTODY" = "COMPLETED") {
  const { listing, seller, buyer } = await seedListing();
  const completedAt = new Date("2026-10-20T09:30:00Z");
  const order = await db.order.create({
    data: {
      reference: `CA-${Math.floor(10_000 + Math.random() * 90_000)}`,
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      mode: "FASTEST",
      status,
      priceUsd: 1_140_000,
      buyerFeeUsd: 34_200,
      sellerFeeUsd: 0,
      totalUsd: 1_174_200,
      feePaidAt: new Date("2026-10-12T10:00:00Z"),
      completedAt: status === "COMPLETED" ? completedAt : null,
    },
  });
  return { order, listing, seller, buyer };
}

const asUser = (user: { id: string; name: string; email: string }) =>
  ({
    id: user.id,
    name: user.name,
    email: user.email,
    image: null,
    emailVerified: true,
    role: "USER",
    slug: null,
    banned: false,
  }) satisfies CurrentUser;

test(
  "a completed deal has a certificate naming the account, both sides and the price",
  withCleanDb(async () => {
    const { order, listing, seller, buyer } = await seedDeal();
    const certificate = await certificateFor(order.id);

    expect(certificate).toMatchObject({
      reference: order.reference,
      handle: listing.handle,
      platform: listing.platform,
      sellerName: seller.name,
      buyerName: buyer.name,
      priceUsd: 1_140_000,
      mode: "FASTEST",
      completedAt: new Date("2026-10-20T09:30:00Z"),
    });
    expect(certificate?.code).toMatch(
      new RegExp(`^${order.reference}-[2-9A-HJ-NP-Z]{8}$`),
    );
  }),
);

test(
  "a deal that has not finished has no certificate",
  withCleanDb(async () => {
    const { order } = await seedDeal("IN_CUSTODY");
    expect(await certificateFor(order.id)).toBeNull();
  }),
);

test(
  "the code checks out however it is typed, and a changed one does not",
  withCleanDb(async () => {
    const { order } = await seedDeal();
    const code = (await certificateFor(order.id))?.code ?? "";

    expect((await verifyCertificate(code))?.reference).toBe(order.reference);
    expect(
      (await verifyCertificate(` ${code.toLowerCase()} `))?.reference,
    ).toBe(order.reference);

    const last = code.at(-1) === "Z" ? "Y" : "Z";
    expect(await verifyCertificate(code.slice(0, -1) + last)).toBeNull();
    expect(await verifyCertificate(`CA-00000-${code.slice(-8)}`)).toBeNull();
    expect(await verifyCertificate("nonsense")).toBeNull();
    expect(await verifyCertificate(randomUUID())).toBeNull();
  }),
);

test(
  "a deal from before the rename, with a DB- reference, checks out too",
  withCleanDb(async () => {
    const { order } = await seedDeal();
    await db.order.update({
      where: { id: order.id },
      data: { reference: "DB-40003" },
    });
    const code = (await certificateFor(order.id))?.code ?? "";
    expect(code.startsWith("DB-40003-")).toBe(true);
    expect((await verifyCertificate(code))?.reference).toBe("DB-40003");
  }),
);

test(
  "a deal's code stops checking out if the deal is no longer completed",
  withCleanDb(async () => {
    const { order } = await seedDeal();
    const code = (await certificateFor(order.id))?.code ?? "";
    await db.order.update({
      where: { id: order.id },
      data: { status: "DISPUTED" },
    });
    expect(await verifyCertificate(code)).toBeNull();
  }),
);

test(
  "only the buyer and the seller download it",
  withCleanDb(async () => {
    const { order, seller, buyer } = await seedDeal();
    const stranger = await seedUser();

    expect(await canDownloadCertificate(asUser(buyer), order.id)).toBe(true);
    expect(await canDownloadCertificate(asUser(seller), order.id)).toBe(true);
    expect(await canDownloadCertificate(asUser(stranger), order.id)).toBe(
      false,
    );
  }),
);

test(
  "the certificate dates a deal by India time, not the server's UTC day",
  withCleanDb(async () => {
    // QA, 2026-10-26: CA-30107 finished on 26 October in Kolkata, and the
    // certificate and its public check, rendered on a UTC server, said 25.
    const { order } = await seedDeal();
    await db.order.update({
      where: { id: order.id },
      data: { completedAt: new Date("2026-10-25T20:15:00Z") },
    });
    const certificate = await certificateFor(order.id);
    if (!certificate) throw new Error("no certificate");
    const { certificateText } = await import(
      "@/components/deals/certificate-art"
    );
    const text = certificateText(certificate, "channeladda.com/certificate/x");
    expect(text).toContain("Completed on 26 October 2026 (India time)");
  }),
);

test("one-line certificate text keeps its spaces from being stretched", async () => {
  // The renderer widened the space after "Certificate" and "certifies":
  // no-break spaces are measured right, and the paragraph still wraps.
  const { tight, ligatureSafe } = await import(
    "@/components/deals/certificate-art"
  );
  expect(tight("Certificate of Transfer")).toBe("Certificate of Transfer");
  expect(ligatureSafe("This certifies that the account")).toBe(
    "This certifies that the account",
  );
});
