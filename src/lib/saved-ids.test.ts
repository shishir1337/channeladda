import { expect, test } from "vitest";
import { withSaved } from "@/lib/saved-ids";

test("a change is a new set, so the hearts re-render", () => {
  // QA: the save went through but the heart only filled on reload, because
  // the one set was changed in place and React saw the same snapshot.
  const before = new Set(["a"]);
  const after = withSaved(before, "b", true);
  expect(after).not.toBe(before);
  expect([...after].sort()).toEqual(["a", "b"]);
  expect([...before]).toEqual(["a"]);
});

test("unsaving takes it out, and nothing saved yet is fine", () => {
  expect([...withSaved(new Set(["a", "b"]), "a", false)]).toEqual(["b"]);
  expect([...withSaved(null, "a", true)]).toEqual(["a"]);
});
