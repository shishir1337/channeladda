import { guides } from "@/data/guides";
import { helpArticles } from "@/data/help";
import { platforms } from "@/data/platforms";
import { sellDescription } from "@/lib/platform-seo";

/**
 * The site as an AI assistant should read it: `/llms.txt`, in the format
 * llmstxt.org describes — a title, a quoted summary, then lists of links.
 *
 * ChatGPT, Perplexity and the rest answer "where can I buy a YouTube
 * channel safely?" from what they can read quickly. This is the short
 * version of the site, built from the same data as the pages, so it never
 * says something the site does not.
 */
export function llmsText(base: string): string {
  const link = (label: string, path: string, about?: string) =>
    `- [${label}](${base}${path})${about ? `: ${about}` : ""}`;

  return [
    "# Channel Adda",
    "",
    "> Channel Adda is a marketplace to buy and sell YouTube channels, Instagram and Facebook pages, Telegram channels and websites. A Channel Adda agent sits in the middle of every deal and holds either the buyer's money or the account itself until the handover is done.",
    "",
    "How a deal works:",
    "",
    "- Fastest: the buyer pays the full price to Channel Adda up front. The seller hands the account to our agent, the buyer is made an owner, and the seller is paid after the holding period.",
    "- Safest: the buyer pays only Channel Adda's fee up front. Our agent takes ownership of the account first, then the buyer pays the seller directly, and our agent hands the account over once the seller confirms the payment.",
    "- Sellers prove they own an account with a one-time code placed on it before a listing goes live; on YouTube the code is checked automatically.",
    "- YouTube channels move through Google's Brand Account ownership tools, with Google's 7-day wait before a new owner can become primary owner. Revenue accounts such as AdSense do not transfer.",
    "- Payments to Channel Adda and seller payouts are in crypto. A dispute freezes the deal until a moderator decides.",
    "",
    "## Buy",
    "",
    link("All accounts for sale", "/browse"),
    ...platforms.map((p) =>
      link(`${p.label} for sale`, `/browse/${p.id}`, p.summary),
    ),
    link("Recently sold", "/sold", "accounts that have sold on Channel Adda"),
    "",
    "## Sell",
    "",
    link("Sell an account", "/sell", "free to list"),
    ...platforms.map((p) =>
      link(
        `Sell ${p.id === "website" ? "a website" : `a ${p.labelOne}`}`,
        `/sell/${p.id}`,
        sellDescription(p),
      ),
    ),
    link("Fees", "/fees", "what the buyer and the seller pay"),
    "",
    "## Guides",
    "",
    ...guides.map((guide) =>
      link(guide.title, `/guides/${guide.slug}`, guide.description),
    ),
    "",
    "## Help",
    "",
    link("How a deal works", "/how-it-works"),
    link("Trust and safety", "/trust-safety"),
    ...helpArticles.map((article) =>
      link(article.title, `/help/${article.slug}`, article.summary),
    ),
    "",
    "## Optional",
    "",
    link("About Channel Adda", "/about"),
    link("Listing rules", "/listing-rules"),
    link("Refund policy", "/refunds"),
    link("Terms", "/terms"),
    link("Privacy", "/privacy"),
    link("Contact support", "/support"),
    "",
  ].join("\n");
}
