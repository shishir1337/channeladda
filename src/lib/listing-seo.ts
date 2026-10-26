import type { Listing } from "@/data/listings";
import type { Platform } from "@/data/platforms";
import { money } from "@/lib/chat-events";
import { imagekitUrl } from "@/lib/media";
import { breadcrumbLd, clampDescription, SITE_NAME } from "@/lib/seo";
import { isPublicKey, keyFromUrl } from "@/lib/upload-keys";
import { formatCompact } from "@/lib/utils";

/**
 * A listing's search description, from its facts.
 *
 * The seller's title alone is forty-odd characters, which a search result
 * pads with whatever it finds on the page. The facts a buyer filters on —
 * the audience, where it is, the price, whether ownership was checked —
 * follow it, in order of what matters, and whole sentences are dropped from
 * the end until it fits.
 */
export function listingDescription(
  listing: Listing,
  platform: Platform,
  sold = false,
): string {
  const title = listing.title.trim().replace(/[.!?]*$/, ".");
  const audience = `${formatCompact(listing.audience)} ${platform.metricLabel.toLowerCase()}`;
  const where =
    listing.country === "Global" ? "worldwide" : `mostly in ${listing.country}`;
  const about = `${platform.labelOne} in ${listing.niche} with ${audience}, ${where}.`;
  const price = sold
    ? `Sold on ${SITE_NAME}.`
    : `Asking ${money(Math.round(listing.price * 100))}${listing.ownershipVerified ? ", ownership verified" : ""}.`;
  const figures = [
    // Not given is not "0% engagement".
    listing.engagement > 0 ? `${listing.engagement}% engagement` : null,
    `${listing.ageYears} ${listing.ageYears === 1 ? "year" : "years"} old`,
    listing.monthlyRevenue > 0
      ? `${money(Math.round(listing.monthlyRevenue * 100))} a month in revenue`
      : "not monetized",
  ]
    .filter(Boolean)
    .join(", ");
  return clampDescription(`${title} ${about} ${price} ${capitalise(figures)}.`);
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A picture a link preview can show: the sample SVG artwork is not one.
 * A cover on ImageKit is offered at its CDN address, at the width a preview
 * draws, so WhatsApp and Google need not follow our route there.
 */
export function previewImage(url: string): string | null {
  if (!/\.(?:png|jpe?g|webp|gif)$/i.test(url)) return null;
  const key = keyFromUrl(url);
  return (key && isPublicKey(key) && imagekitUrl(key, { width: 1200 })) || url;
}

/**
 * The listing as a product with one offer, and where it sits in the site.
 *
 * Only what the page itself says: the price the buyer is asked, the seller
 * by the name on the page, the cover when there is a real one. No rating —
 * a seller's stars are not a review of this account.
 */
export function listingLd(
  base: string,
  listing: Listing,
  platform: Platform,
  { sold = false }: { sold?: boolean } = {},
) {
  const url = `${base}/listing/${listing.slug}`;
  const image = previewImage(listing.coverUrl);
  const product = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${listing.handle} — ${platform.labelOne}`,
    description: listingDescription(listing, platform, sold),
    url,
    category: platform.label,
    ...(image
      ? { image: image.startsWith("/") ? `${base}${image}` : image }
      : {}),
    offers: {
      "@type": "Offer",
      url,
      price: listing.price.toFixed(2),
      priceCurrency: "USD",
      availability: sold
        ? "https://schema.org/SoldOut"
        : listing.reserved
          ? "https://schema.org/LimitedAvailability"
          : "https://schema.org/InStock",
      seller: { "@type": "Person", name: listing.sellerName },
    },
  };
  const crumbs = breadcrumbLd(base, [
    { name: "Home", path: "/" },
    { name: "Browse", path: "/browse" },
    { name: platform.label, path: `/browse/${platform.id}` },
    { name: listing.handle, path: `/listing/${listing.slug}` },
  ]);
  return [product, crumbs] as const;
}
