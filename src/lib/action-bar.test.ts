import { expect, test } from "vitest";
import { hasOwnActionBar } from "@/lib/action-bar";

test("a listing page carries its own phone bar, with the price and the way to buy", () => {
  expect(hasOwnActionBar("/listing/petpatrolshorts-youtube")).toBe(true);
});

test("every other page keeps the site's browse and sell bar", () => {
  for (const path of ["/", "/browse", "/browse/youtube", "/listing", "/sell"]) {
    expect(hasOwnActionBar(path)).toBe(false);
  }
});
