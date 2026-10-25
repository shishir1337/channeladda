import { expect, test } from "vitest";
import { verifiedNote } from "@/lib/kyc";

// The owner (2026-10-26): hovering the Verified badge says what the person
// gave us — which ID, and a video selfie — that we can hand it to the police
// if they commit fraud, and their citizenship.

test("names the ID they sent and their citizenship", () => {
  expect(verifiedNote({ document: "PASSPORT", country: "India" })).toBe(
    "This person has given us their passport details and a video selfie to confirm their identity. This means we can share this data with the police, at their request, in case of fraud on their part. Citizenship: India.",
  );
  expect(verifiedNote({ document: "AADHAAR", country: "India" })).toMatch(
    /their Aadhaar card details/,
  );
  expect(verifiedNote({ document: "PAN", country: "India" })).toMatch(
    /their PAN card details/,
  );
  expect(verifiedNote({ document: "OTHER", country: "Bangladesh" })).toMatch(
    /their government ID details.*Citizenship: Bangladesh\.$/,
  );
});

test("an ID checked before the form existed still says what the badge means", () => {
  // Approved by hand, with no submission on file to name.
  expect(verifiedNote(null)).toBe(
    "Channel Adda's team has checked this person's ID.",
  );
});
