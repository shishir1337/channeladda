/**
 * A long guide: the pages written for what people type into a search box
 * before they ever reach a listing — "how to buy a YouTube channel", "how
 * much is my channel worth". The help centre answers members' questions
 * about a deal; these answer the question that brings someone here.
 *
 * Text may carry links to our own pages as `[words](/path)`. Nothing else
 * is parsed: no bold, no headings inside a paragraph.
 */

export type GuideBlock =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[]; ordered?: boolean };

export type GuideSection = {
  /** An h2. Phrased the way people search where it reads naturally. */
  heading: string;
  blocks: GuideBlock[];
};

export type GuideFaq = { question: string; answer: string };

export type Guide = {
  slug: string;
  /** The page's h1. */
  title: string;
  /** The search-result title, before " | Channel Adda". At most 50 characters. */
  metaTitle: string;
  /** The search-result description: 120 to 160 characters. */
  description: string;
  /** "26 October 2026", as the policies print their dates. */
  updated: string;
  /** The search this guide is written for. Not shown. */
  keyword: string;
  /** Under the h1: the short answer first, in one or two paragraphs. */
  intro: string[];
  sections: GuideSection[];
  /** Folded questions at the end, each answered in a few sentences. */
  faqs: GuideFaq[];
  /** Where to go next: listings, a sell page, a help article, another guide. */
  links: { label: string; href: string }[];
};
