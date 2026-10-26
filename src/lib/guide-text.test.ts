import { describe, expect, it } from "vitest";
import type { Guide } from "@/data/guides/types";
import {
  guideLd,
  guideWords,
  readingMinutes,
  splitLinks,
} from "@/lib/guide-text";

describe("splitLinks", () => {
  it("reads links to our own pages out of a paragraph", () => {
    expect(
      splitLinks("See [the fees](/fees) and [channels](/browse/youtube)."),
    ).toEqual([
      { kind: "text", text: "See " },
      { kind: "link", text: "the fees", href: "/fees" },
      { kind: "text", text: " and " },
      { kind: "link", text: "channels", href: "/browse/youtube" },
      { kind: "text", text: "." },
    ]);
  });

  it("leaves a paragraph with no links as one piece of text", () => {
    expect(splitLinks("No links here.")).toEqual([
      { kind: "text", text: "No links here." },
    ]);
  });

  it("never links off the site", () => {
    for (const href of [
      "https://evil.test",
      "//evil.test",
      "javascript:alert(1)",
    ]) {
      expect(splitLinks(`Go [here](${href}) now`)).toEqual([
        { kind: "text", text: `Go [here](${href}) now` },
      ]);
    }
  });
});

const guide: Guide = {
  slug: "how-to-buy-a-youtube-channel",
  title: "How to buy a YouTube channel safely",
  metaTitle: "How to Buy a YouTube Channel Safely",
  description: "x".repeat(130),
  updated: "26 October 2026",
  keyword: "how to buy a youtube channel",
  intro: ["One two three four five."],
  sections: [
    {
      heading: "Six seven",
      blocks: [
        { kind: "p", text: "Eight [nine](/fees) ten." },
        { kind: "list", items: ["Eleven twelve", "Thirteen"] },
      ],
    },
  ],
  faqs: [{ question: "Fourteen fifteen?", answer: "Sixteen." }],
  links: [{ label: "Seventeen", href: "/fees" }],
};

describe("a guide's length", () => {
  it("counts the words a reader reads, not the link markup", () => {
    // intro 5, heading 2, paragraph 3, list 3, question 2, answer 1.
    expect(guideWords(guide)).toBe(16);
  });

  it("is at least a minute to read", () => {
    expect(readingMinutes(guide)).toBe(1);
    const long = {
      ...guide,
      intro: [Array.from({ length: 1000 }, () => "word").join(" ")],
    };
    expect(readingMinutes(long)).toBe(5);
  });
});

describe("guideLd", () => {
  it("describes the guide as an article by Channel Adda, dated", () => {
    const [article, crumbs] = guideLd("https://channeladda.test", guide);
    expect(article).toMatchObject({
      "@type": "Article",
      headline: "How to buy a YouTube channel safely",
      url: "https://channeladda.test/guides/how-to-buy-a-youtube-channel",
      dateModified: "2026-10-26",
      author: { "@id": "https://channeladda.test/#organization" },
      publisher: { "@id": "https://channeladda.test/#organization" },
      inLanguage: "en",
    });
    expect(crumbs).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        { position: 1, name: "Home" },
        { position: 2, name: "Guides" },
        { position: 3, name: "How to buy a YouTube channel safely" },
      ],
    });
  });
});
