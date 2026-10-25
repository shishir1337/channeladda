import { describe, expect, it } from "vitest";
import { stripBidi } from "@/lib/bidi";

describe("stripBidi", () => {
  it("takes out every override, embedding, isolate and mark", () => {
    const marks = [
      "\u202A",
      "\u202B",
      "\u202C",
      "\u202D",
      "\u202E",
      "\u2066",
      "\u2067",
      "\u2068",
      "\u2069",
      "\u200E",
      "\u200F",
    ];
    for (const mark of marks) {
      expect(stripBidi(`a${mark}b`)).toBe("ab");
    }
  });

  it("undoes the reversed-name trick", () => {
    // Drawn as "Support", stored as an override followed by "troppuS".
    expect(stripBidi("\u202EtroppuS")).toBe("troppuS");
  });

  it("leaves Arabic, Hebrew, Bengali and emoji alone", () => {
    for (const text of [
      "مرحبا بك",
      "שלום עולם",
      "নমস্কার",
      "Deal done 👍🏽 🇮🇳",
      "Price: ٤٥٠ USD",
      // Zero-width joiners hold emoji sequences together; they are not
      // direction marks and must stay.
      "👨‍👩‍👧",
    ]) {
      expect(stripBidi(text)).toBe(text);
    }
  });
});
