import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import {
  TrackRecordLine,
  TrackRecordStats,
} from "@/components/deals/track-record";
import { CurrencyProvider } from "@/lib/currency";

const render = (element: ReactElement) =>
  renderToStaticMarkup(createElement(CurrencyProvider, null, element));

// The owner, on a profile reading "Safest deals 0 · $0.00, Fastest deals 2 ·
// $110.5K": a record is how many deals someone finished and what they were
// worth, not which of our two flows they went through.

const record = {
  deals: 2,
  worthCents: 11_050_000,
  safest: { deals: 0, worthCents: 0 },
  fastest: { deals: 2, worthCents: 11_050_000 },
  asBuyer: 0,
  asSeller: 2,
};

test("a track record is one figure for all deals, never split by Safest and Fastest", () => {
  const grid = render(createElement(TrackRecordStats, { record }));
  const line = render(
    createElement(TrackRecordLine, { record, points: 55_250 }),
  );

  expect(grid).toContain("Deals done");
  expect(grid).toContain("Deal worth");
  expect(line).toContain("55,250 points");
  expect(line).toContain("2 deals");
  for (const html of [grid, line]) {
    expect(html).not.toMatch(/Safest|Fastest/);
  }
});
