import { expect, test } from "vitest";
import { engagementShown } from "@/lib/engagement";

test("a website listed without a rate shows none, not 0%", () => {
  expect(engagementShown({ platform: "website", engagement: 0 })).toBeNull();
  expect(engagementShown({ platform: "website", engagement: 2.5 })).toBe(
    "2.5%",
  );
  expect(engagementShown({ platform: "instagram", engagement: 0 })).toBe("0%");
  expect(engagementShown({ platform: "youtube", engagement: 7.4 })).toBe(
    "7.4%",
  );
});
