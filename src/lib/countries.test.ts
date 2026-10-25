import { expect, test } from "vitest";
import { COUNTRIES, canonicalCountry } from "@/data/countries";
import { parseKyc } from "@/lib/kyc";

// The ID check's country is chosen from a list (the owner, 2026-10-26), so
// the Verified badge's citizenship is always spelled the list's way.

test("the list has every country once, in order", () => {
  expect(COUNTRIES.length).toBe(250);
  expect(new Set(COUNTRIES).size).toBe(COUNTRIES.length);
  expect([...COUNTRIES].sort((a, b) => a.localeCompare(b, "en"))).toEqual(
    COUNTRIES,
  );
  for (const name of [
    "India",
    "Bangladesh",
    "Pakistan",
    "Nepal",
    "Sri Lanka",
  ]) {
    expect(COUNTRIES).toContain(name);
  }
});

test("a country is matched however it was typed, and kept as the list spells it", () => {
  expect(canonicalCountry("  india ")).toBe("India");
  expect(canonicalCountry("UNITED   states")).toBe("United States");
  expect(canonicalCountry("Indai")).toBeNull();
  // Names with an "s" in them: a bad pattern once deleted the letter.
  expect(canonicalCountry("bangladesh")).toBe("Bangladesh");
  expect(canonicalCountry("Bosnia & Herzegovina")).toBe("Bosnia & Herzegovina");
});

const fields = (country: string) => ({
  documentType: "PASSPORT",
  fullName: "Daniel Osei",
  country,
  frontUrl: "",
  backUrl: "",
  videoUrl: "",
});

test("the ID check takes only a country from the list", () => {
  const errors = (country: string) => {
    const parsed = parseKyc(fields(country));
    return parsed.ok ? {} : parsed.errors;
  };
  expect(errors("india").country).toBeUndefined();
  expect(errors("Indai").country).toBe("Choose your country from the list.");
  expect(errors("  ").country).toBe("Choose the country that issued your ID.");
});
