import { expect, test } from "vitest";
import {
  isCustodianRole,
  levelFor,
  levelLabel,
  withinLevel,
} from "@/lib/custody-roles";

// The owner's rule: moderators run deals as the agent, each at one level, and
// the levels do not overlap — level 1 under $10,000, level 2 from $10,000 to
// under $100,000, level 3 from $100,000.

test("agents, moderators and the superadmin can run a deal; finance and members cannot", () => {
  expect(isCustodianRole("AGENT")).toBe(true);
  expect(isCustodianRole("MODERATOR")).toBe(true);
  expect(isCustodianRole("SUPERADMIN")).toBe(true);
  expect(isCustodianRole("FINANCE")).toBe(false);
  expect(isCustodianRole("USER")).toBe(false);
});

test("a price falls in exactly one level, at the exact boundaries", () => {
  expect(levelFor(999_999)).toBe("UNDER_10K"); // $9,999.99
  expect(levelFor(1_000_000)).toBe("UNDER_100K"); // $10,000.00
  expect(levelFor(9_999_999)).toBe("UNDER_100K"); // $99,999.99
  expect(levelFor(10_000_000)).toBe("FROM_100K"); // $100,000.00
  expect(levelFor(0)).toBe("UNDER_10K");
});

test("a level takes its own band and nothing either side of it", () => {
  expect(withinLevel("UNDER_10K", "MODERATOR", 500_000)).toBe(true);
  expect(withinLevel("UNDER_10K", "MODERATOR", 1_000_000)).toBe(false);
  expect(withinLevel("UNDER_100K", "MODERATOR", 999_999)).toBe(false);
  expect(withinLevel("UNDER_100K", "MODERATOR", 5_000_000)).toBe(true);
  expect(withinLevel("FROM_100K", "MODERATOR", 9_999_999)).toBe(false);
  expect(withinLevel("FROM_100K", "MODERATOR", 50_000_000)).toBe(true);
});

test("no level set means any size, and the superadmin is never limited", () => {
  expect(withinLevel(null, "AGENT", 50_000_000)).toBe(true);
  expect(withinLevel(null, "MODERATOR", 100)).toBe(true);
  expect(withinLevel("UNDER_10K", "SUPERADMIN", 50_000_000)).toBe(true);
});

test("each level reads as its band", () => {
  expect(levelLabel("UNDER_10K")).toBe("Level 1 · under $10K");
  expect(levelLabel("UNDER_100K")).toBe("Level 2 · $10K to $100K");
  expect(levelLabel("FROM_100K")).toBe("Level 3 · $100K and up");
  expect(levelLabel(null)).toBe("Any size");
});
