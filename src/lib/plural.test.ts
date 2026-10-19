import { expect, test } from "vitest";
import { countOf } from "@/lib/plural";

test("a count reads with the right noun", () => {
  expect(countOf(1, "review")).toBe("1 review");
  expect(countOf(0, "review")).toBe("0 reviews");
  expect(countOf(2, "sale")).toBe("2 sales");
  expect(countOf(1_204, "listing")).toBe("1,204 listings");
  expect(countOf(3, "pass", "passes")).toBe("3 passes");
});
