import type { Metadata } from "next";

/**
 * What every public page tells search engines and link previews.
 *
 * Next merges metadata shallowly: a page that sets `openGraph` at all loses
 * the root layout's `openGraph` entirely, which is how most pages came to
 * have no og:url and some an og:title belonging to the home page. So each
 * public page builds the whole set here, from the three things that differ:
 * its title, its description and its path.
 */

export const SITE_NAME = "Channel Adda";

/**
 * The other ways people write the name into a search box. Given to search
 * engines with the name, so "channeladda" finds the site as "Channel Adda"
 * does.
 */
export const SITE_ALTERNATE_NAMES = ["ChannelAdda", "channeladda.com"];

/**
 * The home page's title: what people search for first, then the name.
 * "Buy & sell social media accounts" was true, but nobody types it. The
 * owner's first search is "YouTube channel buy sell", in that order, as it
 * is typed in India; "buy YouTube channel" is the platform page's.
 */
export const SITE_TITLE =
  "YouTube Channel Buy & Sell Marketplace | Channel Adda";

/** The site in one search-result line: the home page's, and the fallback. */
export const SITE_DESCRIPTION =
  "YouTube channel buy and sell, made safe: buy or sell monetized YouTube channels, plus Instagram, Facebook and Telegram accounts. An agent holds the money.";

/**
 * Channel Adda's own profiles elsewhere — a YouTube channel, an Instagram
 * page, a Telegram channel — once there are some. Search engines read them
 * as the same company, which is most of what makes a name searchable. None
 * yet: the footer says so too.
 */
export const SOCIAL_PROFILES: string[] = [];

/** What a search result shows before it cuts the snippet off. */
export const DESCRIPTION_MAX = 160;

/**
 * A description that fits a search result.
 *
 * Whole sentences while they fit, because a sentence cut in half reads as a
 * mistake. When whole sentences would leave most of the room empty — one
 * short summary before a long paragraph — it is cut at a word instead and
 * given an ellipsis.
 */
export function clampDescription(
  text: string,
  max: number = DESCRIPTION_MAX,
): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;

  // A sentence ends at a stop followed by a space, so "2.14M" and
  // "$12,500.00" stay whole.
  const sentences = clean.split(/(?<=[.!?])\s+/);
  let kept = "";
  for (const sentence of sentences) {
    if (!/[.!?]$/.test(sentence)) break;
    const next = `${kept} ${sentence}`.trim();
    if (next.length > max) break;
    kept = next;
  }
  // Whole sentences, unless that leaves a line where there is room for
  // two: then as much as fits, cut at a word.
  if (kept.length >= max * 0.6) return kept;

  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  const atWord = (space > 0 ? cut.slice(0, space) : cut).replace(
    /[\s,;:.—–-]+$/,
    "",
  );
  // Nothing gained over the whole sentences: keep those.
  if (kept && atWord.length <= kept.length) return kept;
  return `${atWord}…`;
}

/** "Browse accounts for sale · Page 2", and the title as it was on page 1. */
export function pagedTitle(title: string, page: number): string {
  return page > 1 ? `${title} · Page ${page}` : title;
}

/** The address of one page of a list, with only the page kept. */
export function pagedPath(path: string, page: number): string {
  return page > 1 ? `${path}?page=${page}` : path;
}

export type PageMetadataInput = {
  /** Without the " | Channel Adda" the layout adds; `absolute` skips it. */
  title: string | { absolute: string };
  description: string;
  /** Path on this site, starting with a slash: the canonical address. */
  path: string;
  /** Preview pictures of the page's own. Left out, the site's default. */
  images?: { url: string; width?: number; height?: number; alt?: string }[];
  type?: "website" | "article" | "profile";
};

/**
 * The site's own preview picture, drawn by `app/opengraph-image.tsx`.
 *
 * Named here as well because Next only applies that file to pages that set
 * no `openGraph` of their own — and every public page sets one, for og:url.
 */
export const DEFAULT_OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Channel Adda — buy and sell YouTube channels and social media accounts safely",
};

export function pageMetadata({
  title,
  description,
  path,
  images,
  type = "website",
}: PageMetadataInput): Metadata {
  const text = clampDescription(description);
  const pictures = images?.length ? images : [DEFAULT_OG_IMAGE];
  const shown =
    typeof title === "string" ? `${title} | ${SITE_NAME}` : title.absolute;
  return {
    title,
    description: text,
    alternates: { canonical: path },
    openGraph: {
      type,
      siteName: SITE_NAME,
      title: shown,
      description: text,
      url: path,
      images: pictures,
    },
    twitter: {
      card: "summary_large_image",
      title: shown,
      description: text,
      images: pictures.map((image) => image.url),
    },
  };
}

/**
 * Structured data, as the text of a `<script type="application/ld+json">`.
 *
 * A listing title is the seller's own words, and `</script>` inside it
 * would end the tag and let the rest run as HTML. Every `<` is written as
 * its escape, which JSON reads back as the same character.
 */
export function jsonLdText(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

type Crumb = { name: string; path: string };

export function breadcrumbLd(base: string, crumbs: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: `${base}${crumb.path}`,
    })),
  };
}

/** Who runs the site, and the site itself, for the home page. */
export function siteLd(base: string, description: string) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${base}/#organization`,
      name: SITE_NAME,
      alternateName: SITE_ALTERNATE_NAMES,
      url: `${base}/`,
      logo: `${base}/email/mark.png`,
      description,
      email: "support@channeladda.com",
      ...(SOCIAL_PROFILES.length ? { sameAs: SOCIAL_PROFILES } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${base}/#website`,
      name: SITE_NAME,
      alternateName: SITE_ALTERNATE_NAMES,
      url: `${base}/`,
      inLanguage: "en",
      publisher: { "@id": `${base}/#organization` },
      // The browse page reads ?q= (see listing-query), so this is a search
      // the site really answers.
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${base}/browse?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
  ];
}
