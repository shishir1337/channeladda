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

test("a badge approved by hand still gives the whole statement", () => {
  // No submission on file to name: "ID", and the profile's country.
  expect(verifiedNote(null, "India")).toBe(
    "This person has given us their ID details and a video selfie to confirm their identity. This means we can share this data with the police, at their request, in case of fraud on their part. Citizenship: India.",
  );
});

test("an unknown country leaves the citizenship out", () => {
  const withoutCitizenship =
    "This person has given us their ID details and a video selfie to confirm their identity. This means we can share this data with the police, at their request, in case of fraud on their part.";
  expect(verifiedNote(null)).toBe(withoutCitizenship);
  expect(verifiedNote(null, null)).toBe(withoutCitizenship);
  expect(verifiedNote(null, "Global")).toBe(withoutCitizenship);
});

test("the ID check's country wins over the profile's", () => {
  expect(
    verifiedNote({ document: "PASSPORT", country: "India" }, "Global"),
  ).toMatch(/Citizenship: India\.$/);
});
