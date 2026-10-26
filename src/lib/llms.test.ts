import { describe, expect, it } from "vitest";
import { guides } from "@/data/guides";
import { platforms } from "@/data/platforms";
import { llmsText } from "@/lib/llms";

const base = "https://channeladda.test";
const text = llmsText(base);

describe("llms.txt", () => {
  it("opens with the name and a one-paragraph summary, as the format asks", () => {
    const [title, blank, summary] = text.split("\n");
    expect(title).toBe("# Channel Adda");
    expect(blank).toBe("");
    expect(summary).toMatch(/^> Channel Adda is a marketplace/);
    expect(summary).toContain("YouTube channels");
  });

  it("points at every platform's listings and sell page, and every guide", () => {
    for (const p of platforms) {
      expect(text).toContain(`(${base}/browse/${p.id})`);
      expect(text).toContain(`(${base}/sell/${p.id})`);
    }
    for (const guide of guides) {
      expect(text).toContain(`[${guide.title}](${base}/guides/${guide.slug})`);
    }
  });

  it("gives full addresses only", () => {
    const links = [...text.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(15);
    for (const link of links) expect(link.startsWith(`${base}/`)).toBe(true);
  });
});
