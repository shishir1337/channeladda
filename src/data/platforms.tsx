import type { ComponentType, SVGProps } from "react";
import {
  FacebookIcon,
  InstagramIcon,
  TelegramIcon,
  WebsiteIcon,
  YouTubeIcon,
} from "@/components/icons/brand-icons";

export type PlatformId =
  | "youtube"
  | "instagram"
  | "facebook"
  | "telegram"
  | "website";

export type Platform = {
  id: PlatformId;
  name: string;
  /** Theme-aware brand colour token, see globals.css. */
  tint: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** What the audience metric is called on this platform. */
  metricLabel: string;
  listings: number;
  startingPrice: number;
  searchPlaceholder: string;
  /** Plural noun for the asset, used in headings and copy. */
  assetNoun: string;
  /** Landing-page intro. Distinct per platform for search. */
  blurb: string;
  /** How ownership actually moves on this platform, in plain language. */
  transferNote: string;
  /** A Fastest deal's holding period, in days: how long the buyer is a
   *  manager before being made primary owner and the seller is paid. */
  holdDays: number;
  /** Buyer-facing handover checklist shown on every listing for this platform. */
  transferSteps: string[];
  /**
   * Where a seller puts the ownership code on this platform, in their words.
   *
   * The code proves control because only the owner can edit the place it
   * goes, and that place is different everywhere: a YouTube description, an
   * Instagram bio, a Telegram channel's info. One set of YouTube Studio
   * instructions shown to every seller sent the other four looking for a
   * Customisation tab that does not exist.
   */
  ownershipCheck: {
    /** The spot itself, read after "put it in": "your channel description". */
    place: string;
    /** Seller-facing, in order, from opening the app to saving. */
    steps: string[];
    /**
     * We can read the code back ourselves. Only YouTube has a public API for
     * it; everywhere else a moderator opens the account and looks.
     */
    automatic: boolean;
  };
};

export const platforms: Platform[] = [
  {
    id: "youtube",
    name: "YouTube",
    tint: "var(--brand-youtube)",
    icon: YouTubeIcon,
    metricLabel: "Subscribers",
    listings: 2418,
    startingPrice: 120,
    searchPlaceholder: "Try “monetized tech channel, 100K+ subs”",
    assetNoun: "channels",
    blurb:
      "Monetized and faceless YouTube channels with verified watch time, revenue history and a clean strike record. Every channel is checked for ownership before it is listed, and we confirm whether it sits on a Brand Account before a sale can start.",
    transferNote:
      "A Brand Account channel moves cleanly: you are invited as a manager, then promoted to primary owner once Google’s waiting period passes. Channels on a personal Google account cannot be transferred this way, so we flag them separately.",
    holdDays: 7,
    transferSteps: [
      "Seller invites your Google account as a channel manager",
      "Google’s waiting period passes before ownership can move",
      "Seller promotes you to primary owner of the Brand Account",
      "You change the recovery email and phone, then enable 2FA",
      "Seller is removed from the channel permissions entirely",
    ],
    ownershipCheck: {
      place: "your channel description",
      steps: [
        "Open YouTube Studio, then Customisation and Basic info.",
        "Paste the code anywhere in the description and press Publish.",
      ],
      automatic: true,
    },
  },
  {
    id: "instagram",
    name: "Instagram",
    tint: "var(--brand-instagram)",
    icon: InstagramIcon,
    metricLabel: "Followers",
    listings: 3162,
    startingPrice: 45,
    searchPlaceholder: "Try “fashion page, 500K followers, India”",
    assetNoun: "pages",
    blurb:
      "Instagram pages across fashion, fitness, food and travel, with real engagement figures and audience-country breakdowns. Follower counts are checked against engagement so inflated accounts do not reach this page.",
    transferNote:
      "Instagram has no official ownership transfer, so a handover means credentials plus the recovery email and phone. That is why Instagram deals carry our longest hold — a previous owner can attempt recovery for weeks.",
    holdDays: 21,
    transferSteps: [
      "Seller hands over the login and the current recovery email",
      "You change the password and the email to your own",
      "You replace the recovery phone number",
      "You enable two-factor authentication",
      "Seller confirms the page is detached from their Meta account",
    ],
    ownershipCheck: {
      place: "the page’s bio",
      steps: [
        "Open Instagram on the page you are selling and tap Edit profile.",
        "Paste the code anywhere in the bio and save.",
      ],
      automatic: false,
    },
  },
  {
    id: "facebook",
    name: "Facebook",
    tint: "var(--brand-facebook)",
    icon: FacebookIcon,
    metricLabel: "Followers",
    listings: 1943,
    startingPrice: 35,
    searchPlaceholder: "Try “monetized page, in-stream ads enabled”",
    assetNoun: "pages",
    blurb:
      "Facebook Pages with in-stream ads and reels bonuses already switched on, plus the linked groups that often come with them. Monetization status is verified from the payouts dashboard, not a screenshot.",
    transferNote:
      "Pages are the cleanest transfer on the marketplace. You are added with full control through Business Suite and the seller removes themselves, which is an official, reversible-free process Meta supports.",
    holdDays: 7,
    transferSteps: [
      "Seller adds you with full control in Business Suite",
      "You accept the Page invitation",
      "You confirm access to Page settings and the payouts dashboard",
      "Seller removes themselves from the Page",
      "Page is detached from the seller’s Business Manager",
    ],
    ownershipCheck: {
      place: "the Page’s bio",
      steps: [
        "Switch into the Page you are selling and open Edit details, or the bio in its Intro.",
        "Paste the code anywhere in the bio and save.",
      ],
      automatic: false,
    },
  },
  {
    id: "telegram",
    name: "Telegram",
    tint: "var(--brand-telegram)",
    icon: TelegramIcon,
    metricLabel: "Members",
    listings: 1105,
    startingPrice: 25,
    searchPlaceholder: "Try “crypto signals channel, 50K members”",
    assetNoun: "channels",
    blurb:
      "Telegram channels with high open rates and, in many cases, an existing paid-sponsorship pipeline. Member counts and post reach are verified before listing.",
    transferNote:
      "Telegram supports a real Transfer Ownership action, which makes it the fastest and safest handover here. Once it completes it is effectively irreversible, so funds release after just three days.",
    holdDays: 3,
    transferSteps: [
      "Seller confirms two-factor has been active long enough",
      "Seller runs Transfer Ownership to your account",
      "You accept the transfer",
      "You verify you are the sole remaining owner",
      "Seller leaves the channel",
    ],
    ownershipCheck: {
      place: "the channel description",
      steps: [
        "Open the channel, tap its name at the top, then Edit.",
        "Paste the code anywhere in the description and save.",
      ],
      automatic: false,
    },
  },
  {
    id: "website",
    name: "Website",
    tint: "var(--brand-website)",
    icon: WebsiteIcon,
    metricLabel: "Visits / mo",
    listings: 512,
    startingPrice: 250,
    searchPlaceholder: "Try “AdSense blog, $500/mo revenue”",
    assetNoun: "sites",
    blurb:
      "Content websites and blogs with organic search traffic, email lists and affiliate or display-ad income. Traffic is verified from analytics, and we confirm the domain is outside its transfer lock before a deal opens.",
    transferNote:
      "A website sale is really three transfers: the domain via an auth code, the hosting and database, and the analytics properties. AdSense income does not transfer — the buyer must connect their own account.",
    holdDays: 14,
    transferSteps: [
      "Seller unlocks the domain and sends the auth code",
      "You start the registrar transfer and approve it by email",
      "Files and database are migrated to your hosting",
      "Analytics and Search Console properties are handed over",
      "You connect your own AdSense or ad network",
    ],
    ownershipCheck: {
      place: "the site’s home page",
      steps: [
        "Add the code to the home page where anyone can see it without signing in — the footer is fine.",
        "Publish the change and check it shows on the live site, not only in your editor.",
      ],
      automatic: false,
    },
  },
];

export const platformMap = Object.fromEntries(
  platforms.map((p) => [p.id, p]),
) as Record<PlatformId, Platform>;

/** Total live listings, shown on the browse-all calls to action. */
export const totalListings = platforms.reduce((sum, p) => sum + p.listings, 0);
