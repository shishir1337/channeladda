import { describe, expect, it } from "vitest";
import { dealTabs, openTab } from "@/lib/deal-tabs";

// The owner: "in deals there is showing waiting on you, under that finished
// instead of these you could organise according status in tabs".

type Row = Parameters<typeof dealTabs>[0][number];

const row = (over: Partial<Row>): Row => ({
  status: "AWAITING_PAYMENT",
  side: "buyer",
  awaiting: "buyer",
  waitingUntil: null,
  ...over,
});

describe("dealTabs", () => {
  it("sorts each deal into exactly one tab", () => {
    const deals = [
      row({}), // the buyer's turn
      row({ awaiting: "seller" }), // the other side
      row({ waitingUntil: new Date() }), // a hold is running
      row({ status: "DISPUTED", awaiting: "buyer" }),
      row({ status: "COMPLETED", awaiting: null }),
    ];
    const tabs = dealTabs(deals);
    expect(tabs.yours).toHaveLength(1);
    expect(tabs.running).toHaveLength(2);
    expect(tabs.paused).toHaveLength(1);
    expect(tabs.finished).toHaveLength(1);
  });
});

describe("openTab", () => {
  const counts = { yours: 0, running: 2, paused: 0, finished: 3 };

  it("opens the tab that was asked for", () => {
    expect(openTab("finished", counts)).toBe("finished");
  });

  it("otherwise opens on your turn when something is waiting on you", () => {
    expect(openTab(undefined, { ...counts, yours: 1 })).toBe("yours");
  });

  it("otherwise on the first tab with anything in it", () => {
    expect(openTab(undefined, counts)).toBe("running");
    expect(openTab("nonsense", counts)).toBe("running");
  });

  it("falls back to your turn when there is nothing at all", () => {
    expect(
      openTab(undefined, { yours: 0, running: 0, paused: 0, finished: 0 }),
    ).toBe("yours");
  });
});
