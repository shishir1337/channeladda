import { expect, test } from "vitest";
import { threadHref } from "@/lib/thread-href";

test("a conversation link names the listing it is about", () => {
  expect(threadHref("c1", "l1")).toBe("/dashboard/messages/c1?about=l1");
  expect(threadHref("c1")).toBe("/dashboard/messages/c1");
  expect(threadHref("c1", null)).toBe("/dashboard/messages/c1");
  expect(threadHref("c1", "l1", "/admin/messages")).toBe(
    "/admin/messages/c1?about=l1",
  );
});
