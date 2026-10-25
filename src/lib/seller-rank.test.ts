import { expect, test } from "vitest";
import { medalFor, ordinal, rankSellers } from "@/lib/seller-rank";

// The owner's rule, 2026-10-26: every seller on /sellers, by rating points,
// 1st at the top. Ties go to more completed sales, then to who joined first.

const seller = (
  slug: string,
  points: number,
  sales = 0,
  joined = "2024-01-01",
) => ({ slug, points, sales, joinedAt: new Date(joined) });

const order = (list: ReturnType<typeof seller>[]) =>
  rankSellers(list).map((s) => `${s.rank}:${s.slug}`);

test("the most rating points come first, and every seller gets a place", () => {
  expect(order([seller("c", 10), seller("a", 750), seller("b", 250)])).toEqual([
    "1:a",
    "2:b",
    "3:c",
  ]);
});

test("on the same points, more completed sales go first", () => {
  expect(order([seller("few", 500, 2), seller("many", 500, 9)])).toEqual([
    "1:many",
    "2:few",
  ]);
});

test("on the same points and sales, whoever joined earlier goes first", () => {
  expect(
    order([
      seller("newer", 500, 3, "2025-06-01"),
      seller("older", 500, 3, "2023-02-01"),
    ]),
  ).toEqual(["1:older", "2:newer"]);
});

test("a full tie still has one order, whatever order the rows came in", () => {
  const a = seller("alpha", 0, 0, "2024-01-01");
  const b = seller("bravo", 0, 0, "2024-01-01");
  expect(order([a, b])).toEqual(["1:alpha", "2:bravo"]);
  expect(order([b, a])).toEqual(["1:alpha", "2:bravo"]);
});

test("points outrank sales: a big seller with fewer deals still leads", () => {
  expect(order([seller("busy", 100, 40), seller("big", 900, 1)])).toEqual([
    "1:big",
    "2:busy",
  ]);
});

test("ranking leaves the list it was given as it was", () => {
  const list = [seller("b", 1), seller("a", 2)];
  rankSellers(list);
  expect(list.map((s) => s.slug)).toEqual(["b", "a"]);
});

test("gold, silver and bronze for the top three, nobody else", () => {
  expect(medalFor(1, 750)).toBe("gold");
  expect(medalFor(2, 250)).toBe("silver");
  expect(medalFor(3, 1)).toBe("bronze");
  expect(medalFor(4, 9_999)).toBeNull();
});

test("no medal before any points are earned", () => {
  expect(medalFor(1, 0)).toBeNull();
  expect(medalFor(2, 0)).toBeNull();
});

test("places read as 1st, 2nd, 3rd", () => {
  expect(
    [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112].map(ordinal),
  ).toEqual([
    "1st",
    "2nd",
    "3rd",
    "4th",
    "11th",
    "12th",
    "13th",
    "21st",
    "22nd",
    "23rd",
    "101st",
    "111th",
    "112th",
  ]);
});
