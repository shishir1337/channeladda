import { describe, expect, test } from "vitest";
import {
  amountProblem,
  OFFER_PROBLEM_TEXT,
  parseAmount,
} from "@/lib/offer-rules";

// A $900 listing, in cents, as QA found it: a $9,000 offer went through.
const ASKING = 90_000;

describe("an offer from the buyer", () => {
  test("below the asking price is fine", () => {
    expect(amountProblem({ amountCents: 80_000, askingCents: ASKING })).toBe(
      null,
    );
  });

  test("at or above the asking price is refused", () => {
    expect(amountProblem({ amountCents: ASKING, askingCents: ASKING })).toBe(
      "at-asking",
    );
    expect(amountProblem({ amountCents: 900_000, askingCents: ASKING })).toBe(
      "at-asking",
    );
  });

  test("under half the asking price is refused", () => {
    expect(amountProblem({ amountCents: 44_999, askingCents: ASKING })).toBe(
      "too-low",
    );
    expect(amountProblem({ amountCents: 45_000, askingCents: ASKING })).toBe(
      null,
    );
  });
});

describe("a seller's counter to a buyer's offer", () => {
  const answering = { amountCents: 70_000, bySeller: false };

  test("must be more than the buyer offered", () => {
    // QA: the buyer offered $700 and the seller countered $650.
    expect(
      amountProblem({ amountCents: 65_000, askingCents: ASKING, answering }),
    ).toBe("counter-not-higher");
    expect(
      amountProblem({ amountCents: 70_000, askingCents: ASKING, answering }),
    ).toBe("counter-not-higher");
    expect(
      amountProblem({ amountCents: 75_000, askingCents: ASKING, answering }),
    ).toBe(null);
  });

  test("may be the asking price but not more", () => {
    expect(
      amountProblem({ amountCents: ASKING, askingCents: ASKING, answering }),
    ).toBe(null);
    expect(
      amountProblem({
        amountCents: ASKING + 1,
        askingCents: ASKING,
        answering,
      }),
    ).toBe("above-asking");
  });
});

describe("a buyer's counter to the seller's price", () => {
  const answering = { amountCents: 85_000, bySeller: true };

  test("must be less than the seller's price", () => {
    expect(
      amountProblem({ amountCents: 85_000, askingCents: ASKING, answering }),
    ).toBe("counter-not-lower");
    expect(
      amountProblem({ amountCents: 80_000, askingCents: ASKING, answering }),
    ).toBe(null);
  });

  test("still has to be a serious number", () => {
    expect(
      amountProblem({ amountCents: 10_000, askingCents: ASKING, answering }),
    ).toBe("too-low");
  });
});

test("without the asking price only the offer being answered is checked", () => {
  const answering = { amountCents: 70_000, bySeller: false };
  expect(
    amountProblem({ amountCents: 65_000, askingCents: null, answering }),
  ).toBe("counter-not-higher");
  expect(
    amountProblem({ amountCents: 900_000, askingCents: null, answering }),
  ).toBe(null);
});

test("every problem has words for the person typing", () => {
  for (const text of Object.values(OFFER_PROBLEM_TEXT)) {
    expect(text.length).toBeGreaterThan(10);
  }
});

describe("reading an amount someone typed", () => {
  test("plain numbers", () => {
    expect(parseAmount("2100")).toBe(2100);
    expect(parseAmount("850.50")).toBe(850.5);
  });

  test("thousands separators, a dollar sign and spaces", () => {
    // QA: "2,100" and "$150" silently disabled the button.
    expect(parseAmount("2,100")).toBe(2100);
    expect(parseAmount("$150")).toBe(150);
    expect(parseAmount(" $ 1,250.00 ")).toBe(1250);
  });

  test("anything else is not a number", () => {
    expect(parseAmount("")).toBeNaN();
    expect(parseAmount("abc")).toBeNaN();
    expect(parseAmount("12abc")).toBeNaN();
    expect(parseAmount("1.2.3")).toBeNaN();
    expect(parseAmount("-50")).toBeNaN();
  });
});
