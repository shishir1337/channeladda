import { describe, expect, it } from "vitest";
import { offerTabs, openOfferTab } from "@/lib/offer-tabs";

type Row = Parameters<typeof offerTabs>[0][number];

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 24, 12, minutes));
const row = (over: Partial<Row>): Row => ({
  effectiveStatus: "OPEN",
  awaiting: "seller",
  viewingAs: "seller",
  createdAt: at(0),
  ...over,
});

describe("offerTabs", () => {
  it("puts an open offer waiting on you under your turn, wherever it came from", () => {
    const tabs = offerTabs([
      row({}), // a buyer's offer on my listing
      row({ viewingAs: "buyer", awaiting: "buyer" }), // a counter to my offer
      row({ viewingAs: "buyer", awaiting: "seller" }), // my offer, with them
      row({ effectiveStatus: "REJECTED", awaiting: null }),
      row({ effectiveStatus: "WITHDRAWN", awaiting: null }),
    ]);
    expect(tabs.yours).toHaveLength(2);
    expect(tabs.waiting).toHaveLength(1);
    expect(tabs.closed).toHaveLength(2);
  });

  it("lists the newest first in every tab", () => {
    const tabs = offerTabs([
      row({ createdAt: at(1) }),
      row({ createdAt: at(5) }),
    ]);
    expect(tabs.yours.map((o) => o.createdAt)).toEqual([at(5), at(1)]);
  });
});

describe("openOfferTab", () => {
  it("opens where something is, or where it was asked to", () => {
    expect(openOfferTab(undefined, { yours: 0, waiting: 1, closed: 4 })).toBe(
      "waiting",
    );
    expect(openOfferTab("closed", { yours: 2, waiting: 0, closed: 0 })).toBe(
      "closed",
    );
    expect(openOfferTab(undefined, { yours: 0, waiting: 0, closed: 0 })).toBe(
      "yours",
    );
  });
});
