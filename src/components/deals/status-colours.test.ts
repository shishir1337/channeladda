import { describe, expect, it } from "vitest";
import { statusMeta } from "@/components/dashboard/listing-status";
import { STATUS_TONE } from "@/components/deals/deal-status";
import { OFFER_STATUS } from "@/components/deals/offer-status";

// The owner: "badges are not using proper color at all ... in Recent
// activity withdraw and decline showing the same". Outcomes that mean
// different things never share a colour.

describe("offer badges", () => {
  it("give declined, withdrawn, expired, countered and accepted each their own colour", () => {
    const variants = [
      OFFER_STATUS.REJECTED.variant,
      OFFER_STATUS.WITHDRAWN.variant,
      OFFER_STATUS.EXPIRED.variant,
      OFFER_STATUS.COUNTERED.variant,
      OFFER_STATUS.ACCEPTED.variant,
      OFFER_STATUS.OPEN.variant,
    ];
    expect(new Set(variants).size).toBe(variants.length);
  });

  it("show a declined offer in red and an accepted one in green", () => {
    expect(OFFER_STATUS.REJECTED).toEqual({
      label: "Declined",
      variant: "danger",
    });
    expect(OFFER_STATUS.ACCEPTED.variant).toBe("verified");
  });
});

describe("deal badges", () => {
  it("tell a finished deal from a cancelled, expired or disputed one", () => {
    const ends = [
      STATUS_TONE.COMPLETED,
      STATUS_TONE.CANCELLED,
      STATUS_TONE.PAYMENT_EXPIRED,
      STATUS_TONE.RETURNED_TO_SELLER,
    ];
    expect(new Set(ends).size).toBe(ends.length);
    expect(STATUS_TONE.DISPUTED).toBe("danger");
  });

  it("tell waiting for payment from a channel in our hands", () => {
    expect(STATUS_TONE.AWAITING_PAYMENT).not.toBe(STATUS_TONE.IN_CUSTODY);
  });
});

describe("listing badges", () => {
  it("tell live, reserved, sold and paused apart", () => {
    const variants = (
      ["LIVE", "RESERVED", "SOLD", "PAUSED", "DRAFT"] as const
    ).map((status) => statusMeta(status).variant);
    expect(new Set(variants).size).toBe(variants.length);
  });
});
