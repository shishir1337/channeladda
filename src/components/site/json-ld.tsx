import { jsonLdText } from "@/lib/seo";

/**
 * Structured data for search engines, in the page's HTML.
 *
 * The one place this site writes raw HTML: a JSON-LD block has to be the
 * script element's text, and React would escape it into something no
 * crawler reads. `jsonLdText` escapes every `<`, so text a seller wrote
 * cannot close the tag.
 */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD must be the script's text; `jsonLdText` escapes `<`.
      dangerouslySetInnerHTML={{ __html: jsonLdText(data) }}
    />
  );
}
