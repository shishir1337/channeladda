import { expect, test } from "vitest";
import {
  capLoad,
  capWarning,
  isCustodianRole,
  levelFor,
  levelLabel,
  withinLevel,
} from "@/lib/custody-roles";

// The owner's rule: moderators run deals as the agent, each at one level, and
// the levels do not overlap — level 1 under $100, level 2 from $100 to under
// $1,000, level 3 from $1,000.

test("agents, moderators and the superadmin can run a deal; finance and members cannot", () => {
  expect(isCustodianRole("AGENT")).toBe(true);
  expect(isCustodianRole("MODERATOR")).toBe(true);
  expect(isCustodianRole("SUPERADMIN")).toBe(true);
  expect(isCustodianRole("FINANCE")).toBe(false);
  expect(isCustodianRole("USER")).toBe(false);
});

test("a price falls in exactly one level, at the exact boundaries", () => {
  expect(levelFor(9_999)).toBe("UNDER_10K"); // $99.99
  expect(levelFor(10_000)).toBe("UNDER_100K"); // $100.00
  expect(levelFor(99_999)).toBe("UNDER_100K"); // $999.99
  expect(levelFor(100_000)).toBe("FROM_100K"); // $1,000.00
  expect(levelFor(0)).toBe("UNDER_10K");
});

test("a level takes its own band and nothing either side of it", () => {
  expect(withinLevel("UNDER_10K", "MODERATOR", 5_000)).toBe(true);
  expect(withinLevel("UNDER_10K", "MODERATOR", 10_000)).toBe(false);
  expect(withinLevel("UNDER_100K", "MODERATOR", 9_999)).toBe(false);
  expect(withinLevel("UNDER_100K", "MODERATOR", 50_000)).toBe(true);
  expect(withinLevel("UNDER_100K", "MODERATOR", 100_000)).toBe(false);
  expect(withinLevel("FROM_100K", "MODERATOR", 99_999)).toBe(false);
  expect(withinLevel("FROM_100K", "MODERATOR", 50_000_000)).toBe(true);
});

test("no level set means any size, and the superadmin is never limited", () => {
  expect(withinLevel(null, "AGENT", 50_000_000)).toBe(true);
  expect(withinLevel(null, "MODERATOR", 100)).toBe(true);
  expect(withinLevel("UNDER_10K", "SUPERADMIN", 50_000_000)).toBe(true);
});

test("each level reads as its band", () => {
  expect(levelLabel("UNDER_10K")).toBe("Level 1 · under $100");
  expect(levelLabel("UNDER_100K")).toBe("Level 2 · $100 to $1,000");
  expect(levelLabel("FROM_100K")).toBe("Level 3 · $1,000 and up");
  expect(levelLabel(null)).toBe("Any size");
});

test("an agent over the hold cap reads as over the limit, not at it", () => {
  // QA: Team said "11 of 10 · At cap".
  expect(capLoad(11, 10)).toEqual({
    state: "over",
    line: "Over the limit (11 of 10)",
  });
  expect(capLoad(10, 10).state).toBe("at");
  expect(capLoad(9, 10).state).toBe("near");
  expect(capLoad(2, 10)).toEqual({ state: "free", line: "2 of 10" });
});

test("lowering the cap below what agents hold warns, and does not refuse", () => {
  // QA: Settings took a cap under what agents already held, silently.
  expect(capWarning(10, [3, 10])).toBeNull();
  expect(capWarning(8, [3, 10])).toBe(
    "One agent already holds 10. They keep what they hold, but cannot take another deal until they are under 8.",
  );
  expect(capWarning(2, [3, 10, 1])).toMatch(
    /^2 agents already hold more — up to 10/,
  );
  expect(capWarning(Number.NaN, [3])).toBeNull();
});
