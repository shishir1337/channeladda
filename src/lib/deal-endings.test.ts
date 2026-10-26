import { expect, test } from "vitest";
import {
  ENDINGS,
  endingLabel,
  endingWeight,
  needsFinance,
  undoLine,
} from "@/lib/deal-endings";

// The staff desk spells out what each ending does before finance picks one.
// On Safest we never hold the price, and the desk used to say we did — so a
// decision meant to pay the seller paid nobody, and one meant to refund the
// buyer refunded nothing.

const consequence = (to: string) =>
  ENDINGS.find((ending) => ending.to === to)?.consequence("SAFEST") ?? "";

test("no Safest ending promises to pay or refund the price", () => {
  for (const ending of ENDINGS) {
    const text = ending.consequence("SAFEST");
    expect(text, ending.to).not.toMatch(/price to the seller's wallet/i);
    expect(text, ending.to).not.toMatch(/refunds whatever we are holding/i);
  }
  expect(consequence("COMPLETED")).toMatch(/never held the price/);
  expect(consequence("RETURNED_TO_SELLER")).toMatch(/never held the price/);
});

test("finishing a Safest deal says the channel goes to the buyer", () => {
  expect(consequence("COMPLETED")).toMatch(/to the buyer/);
  const completed = ENDINGS.find((ending) => ending.to === "COMPLETED");
  expect(completed?.label).not.toMatch(/seller's favour/);
});

test("the desk's line about what cannot be undone counts what it shows", () => {
  // QA: a disputed deal is not offered the pause again, and the panel still
  // said "Four of these five cannot be undone" above four options.
  expect(undoLine(ENDINGS)).toBe("Four of these five cannot be undone.");
  const paused = ENDINGS.filter((ending) => ending.to !== "DISPUTED");
  expect(undoLine(paused)).toBe("None of these can be undone.");
});

test("finishing a Fastest deal whose seller was paid is not tagged as moving money", () => {
  // QA, CA-75190: "Finish the deal" was tagged "moves money" beside text
  // saying nothing more is paid out. The tag and the words agree now, and
  // finance still decides it.
  const completed = ENDINGS.find((ending) => ending.to === "COMPLETED");
  if (!completed) throw new Error("no COMPLETED ending");
  const words = {
    asset: "Page",
    handToBuyer: "our agent gives the buyer full control",
    agentTook: "when our agent took the Page",
  };
  expect(endingWeight(completed, true, true)).toBe("final");
  expect(completed.consequence("FASTEST", { words, sellerPaid: true })).toMatch(
    /no money moves here/,
  );
  expect(endingWeight(completed, true, false)).toBe("money");
  expect(
    completed.consequence("FASTEST", { words, sellerPaid: false }),
  ).toMatch(/pays the seller the price we are holding/);
  expect(needsFinance(completed, true)).toBe(true);
});

test("the endings speak the deal's platform", () => {
  const words = {
    asset: "Page",
    handToBuyer: "our agent gives the buyer full control",
    agentTook: "when our agent took the Page",
  };
  for (const ending of ENDINGS) {
    for (const mode of ["SAFEST", "FASTEST"] as const) {
      const text = `${endingLabel(ending, { words })} ${ending.consequence(mode, { words })}`;
      expect(text, `${mode} ${ending.to}`).not.toMatch(
        /primary owner|\bchannel\b/,
      );
    }
  }
  const back = ENDINGS.find((ending) => ending.to === "RETURNED_TO_SELLER");
  if (!back) throw new Error("no RETURNED_TO_SELLER ending");
  expect(endingLabel(back, { words })).toBe("Return the Page to the seller");
  expect(endingLabel(back)).toBe("Return the channel to the seller");
});
