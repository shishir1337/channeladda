import { expect, test } from "vitest";
import { fileSize } from "@/lib/file-size";

test("under a megabyte reads in kilobytes", () => {
  // QA: a small photo's chip said "0.0MB".
  expect(fileSize(30_000)).toBe("29 KB");
  expect(fileSize(500)).toBe("1 KB");
  expect(fileSize(1_000_000)).toBe("977 KB");
});

test("a megabyte and up reads in megabytes, to one place", () => {
  expect(fileSize(1024 * 1024)).toBe("1.0 MB");
  expect(fileSize(2.5 * 1024 * 1024)).toBe("2.5 MB");
});

test("nothing is nothing", () => {
  expect(fileSize(0)).toBe("0 KB");
});
