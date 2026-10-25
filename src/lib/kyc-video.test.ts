import { expect, test } from "vitest";
import {
  KYC_RECORD_MAX_SECONDS,
  KYC_VIDEO_MAX_SECONDS,
  KYC_VIDEO_MIN_SECONDS,
  KYC_VIDEO_RULE,
  videoLengthProblem,
} from "@/lib/kyc";

// QA: a 70-second upload was refused with "Keep it to 10 to 30 seconds",
// while an 8-second upload and a 6-second recording went through and the
// field said "Up to 30 seconds". One rule now, and the words say it.

test("the rule is 5 to 30 seconds recorded, 5 to 60 uploaded, and says so", () => {
  expect([
    KYC_VIDEO_MIN_SECONDS,
    KYC_RECORD_MAX_SECONDS,
    KYC_VIDEO_MAX_SECONDS,
  ]).toEqual([5, 30, 60]);
  expect(KYC_VIDEO_RULE).toBe(
    "Record 5 to 30 seconds here, or upload a video of 5 to 60 seconds.",
  );
});

test("a video inside the rule is taken, and one outside it says the rule", () => {
  for (const seconds of [5, 6, 8, 30, 45, 60, 4.6, 60.4]) {
    expect(videoLengthProblem(seconds), String(seconds)).toBeNull();
  }
  expect(videoLengthProblem(70)).toBe(
    "That video is 70 seconds long. Upload one of 5 to 60 seconds, or record one here.",
  );
  expect(videoLengthProblem(3)).toBe(
    "That video is 3 seconds long. It needs at least 5 seconds.",
  );
  expect(videoLengthProblem(1)).toBe(
    "That video is 1 second long. It needs at least 5 seconds.",
  );
});

test("a length the browser cannot read is not a reason to refuse", () => {
  expect(videoLengthProblem(null)).toBeNull();
  expect(videoLengthProblem(Number.POSITIVE_INFINITY)).toBeNull();
});
