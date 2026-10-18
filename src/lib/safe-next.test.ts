import { expect, test } from "vitest";
import { safeNext } from "@/lib/safe-next";

test("a path on this site is kept", () => {
  expect(safeNext("/dashboard/listings/new")).toBe("/dashboard/listings/new");
  expect(safeNext("/listing/mkbhd-youtube?tab=proof#offer")).toBe(
    "/listing/mkbhd-youtube?tab=proof#offer",
  );
});

test("anything that leaves the site is refused", () => {
  // "//host" is a protocol-relative URL: it starts with "/" and is another
  // site. Sign-in used to accept it, which made a link like
  // /signin?next=//phish.example a way to land a fresh session elsewhere.
  for (const next of [
    "//evil.example",
    "//evil.example/dashboard",
    "/\\evil.example",
    "\\\\evil.example",
    "https://evil.example",
    "javascript:alert(1)",
    " /dashboard",
    "",
  ]) {
    expect(safeNext(next)).toBe("/dashboard");
  }
});

test("a missing or odd value falls back", () => {
  expect(safeNext(undefined)).toBe("/dashboard");
  expect(safeNext(["/a", "/b"])).toBe("/dashboard");
  expect(safeNext(undefined, "/")).toBe("/");
});
