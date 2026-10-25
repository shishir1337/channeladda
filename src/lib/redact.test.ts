import { expect, test } from "vitest";
import { removedNote } from "@/lib/redact";

test("one plain sentence for whatever was taken out", () => {
  expect(removedNote(["a phone number"])).toBe(
    "We removed a phone number. Deals stay on Channel Adda so we can protect them.",
  );
  expect(removedNote(["an email address", "a phone number"])).toBe(
    "We removed an email address and a phone number. Deals stay on Channel Adda so we can protect them.",
  );
  expect(removedNote(["an email address", "a phone number", "a link"])).toBe(
    "We removed an email address, a phone number and a link. Deals stay on Channel Adda so we can protect them.",
  );
  expect(removedNote([])).toBe(
    "We removed contact details. Deals stay on Channel Adda so we can protect them.",
  );
});
