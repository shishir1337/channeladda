import { describe, expect, it } from "vitest";
import { platforms } from "@/data/platforms";
import {
  buyFaqs,
  buyTitle,
  sellDescription,
  sellFaqs,
  sellTitle,
} from "@/lib/platform-seo";
import { DESCRIPTION_MAX } from "@/lib/seo";

describe("each platform's search titles", () => {
  it("say buy or sell and the platform, and fit a search result", () => {
    for (const p of platforms) {
      expect(buyTitle(p)).toMatch(/^Buy /);
      expect(sellTitle(p)).toMatch(/^Sell /);
      for (const title of [buyTitle(p), sellTitle(p)]) {
        expect(title).toContain(p.name);
        // The layout adds " | Channel Adda": 50 and that is a full line.
        expect(title.length).toBeLessThanOrEqual(50);
      }
    }
  });

  it("are the words people search for YouTube", () => {
    const youtube = platforms.find((p) => p.id === "youtube");
    if (!youtube) throw new Error("no YouTube");
    expect(buyTitle(youtube).toLowerCase()).toContain("buy youtube channels");
    expect(sellTitle(youtube).toLowerCase()).toContain(
      "sell your youtube channel",
    );
  });

  it("describe each sell page in one search line", () => {
    for (const p of platforms) {
      const text = sellDescription(p);
      expect(text.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
      expect(text.length).toBeGreaterThan(100);
      expect(text).toContain(p.labelOne.replace(/^Website$/, "website"));
    }
  });
});

describe("each platform's questions", () => {
  it("answers in the platform's own word for the account", () => {
    for (const p of platforms) {
      const other = p.noun === "channel" ? "page" : "channel";
      for (const faq of [...buyFaqs(p), ...sellFaqs(p)]) {
        expect(faq.question.length).toBeGreaterThan(10);
        expect(faq.answer.length).toBeGreaterThan(60);
        // "We hold the channel" on an Instagram page reads as a mistake.
        expect(`${faq.question} ${faq.answer}`).not.toMatch(
          new RegExp(`\\bthe ${other}\\b`),
        );
      }
    }
  });

  it("never asks the same question twice on a page", () => {
    for (const p of platforms) {
      for (const list of [buyFaqs(p), sellFaqs(p)]) {
        const asked = list.map((faq) => faq.question);
        expect(new Set(asked).size).toBe(asked.length);
        expect(list.length).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it("tells a YouTube buyer that AdSense stays behind, and the hold", () => {
    const youtube = platforms.find((p) => p.id === "youtube");
    if (!youtube) throw new Error("no YouTube");
    const text = buyFaqs(youtube)
      .map((faq) => faq.answer)
      .join(" ");
    expect(text).toContain("AdSense");
    expect(text).toContain("7 days");
  });

  it("tells a seller where the ownership code goes on their platform", () => {
    for (const p of platforms) {
      const text = sellFaqs(p)
        .map((faq) => faq.answer)
        .join(" ");
      expect(text).toContain(p.ownershipCheck.place);
    }
  });
});
