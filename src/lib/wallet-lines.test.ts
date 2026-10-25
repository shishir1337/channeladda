import { describe, expect, it } from "vitest";
import { walletDetail } from "@/lib/wallet-lines";

const deal = { reference: "CA-52902", handle: "@nomad.lens" };

describe("walletDetail", () => {
  it("never shows a withdrawal's id or the reference finance typed", () => {
    expect(
      walletDetail({
        kind: "WITHDRAWAL",
        note: "Withdrawal cmvgoaft3003e6cuqptqulgr2 (test-local-run-0001)",
        deal: null,
      }),
    ).toBeNull();
  });

  it("does not repeat the title in other words", () => {
    for (const [kind, note] of [
      ["BADGE_FEE", "Reseller badge, 30 days"],
      ["ESCROW_RELEASE", "Sale released to seller"],
      ["ESCROW_RELEASE", "Hold released"],
      ["BUYER_FEE", "Buyer fee"],
      ["SELLER_FEE", "Seller fee"],
      ["ESCROW_RELEASE", "Fee earned: the agent took custody"],
      ["ESCROW_HOLD", "FASTEST opening payment from wallet"],
    ]) {
      expect(walletDetail({ kind, note, deal: null }), note).toBeNull();
    }
  });

  it("says which deal the money moved for", () => {
    expect(
      walletDetail({
        kind: "ESCROW_RELEASE",
        note: "Sale released to seller",
        deal,
      }),
    ).toBe("Deal CA-52902 · @nomad.lens");
    expect(
      walletDetail({
        kind: "ESCROW_HOLD",
        note: "Paid deal CA-52902 from balance",
        deal,
      }),
    ).toBe("Deal CA-52902 · @nomad.lens");
  });

  it("keeps the notes that tell the member something, in plain words", () => {
    expect(
      walletDetail({ kind: "DEPOSIT", note: "Deposit in USDT", deal: null }),
    ).toBe("Paid in USDT");
    expect(
      walletDetail({
        kind: "DEPOSIT",
        note: "Paid twice for this deal; credited to your balance (USDT)",
        deal,
      }),
    ).toBe(
      "Deal CA-52902 · @nomad.lens — You paid this deal twice, so the second payment came to your balance",
    );
    expect(
      walletDetail({ kind: "REFUND", note: "Refunded by the processor", deal }),
    ).toBe("Deal CA-52902 · @nomad.lens — Refunded by the payment processor");
  });

  it("shows a correction's reason, which staff write for the member", () => {
    expect(
      walletDetail({
        kind: "ADJUSTMENT",
        note: "Refund of a fee charged twice on 12 October",
        deal: null,
      }),
    ).toBe("Refund of a fee charged twice on 12 October");
  });

  it("shows nothing for a note it does not know", () => {
    expect(
      walletDetail({
        kind: "DEPOSIT",
        note: "cmvgoaft3003e6 internal",
        deal: null,
      }),
    ).toBeNull();
  });
});
