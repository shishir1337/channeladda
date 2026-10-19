import { expect, test } from "vitest";
import { SUPPORT_TOPICS, supportHref } from "@/lib/support";

test("a support link arrives at the form with its topic chosen", () => {
  for (const topic of SUPPORT_TOPICS) {
    const url = new URL(supportHref(topic), "https://channeladda.com");
    expect(url.pathname).toBe("/support");
    expect(url.searchParams.get("topic")).toBe(topic);
  }
});

test("someone locked out of two-factor has a topic of their own", () => {
  expect(SUPPORT_TOPICS).toContain("I am locked out of my account");
});
