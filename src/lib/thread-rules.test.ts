import { expect, test } from "vitest";
import { writesInClosedThread } from "@/lib/thread-rules";

test("Channel Adda's own people can still write in a closed conversation", () => {
  // Staff, because closing it is often the moment they need to explain why;
  // the deal's agent, because a deal mid-transfer still needs them to talk.
  expect(writesInClosedThread("staff")).toBe(true);
  expect(writesInClosedThread("agent")).toBe(true);
});

test("the two sides cannot", () => {
  expect(writesInClosedThread("buyer")).toBe(false);
  expect(writesInClosedThread("seller")).toBe(false);
});
