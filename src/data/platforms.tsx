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
  searchPlaceholder: string;
  /** Plural noun for the asset, used in headings and copy. */
  assetNoun: string;
  /**
   * The asset in one word, for sentences about this platform's deals: a
   * Telegram channel, an Instagram page, a website. "We hold the channel"
   * was printed on every listing, a page and a website included.
   */
  noun: "channel" | "page" | "site";
  /**
   * The whole category, for headings and titles. Usually the name and the
   * plural noun; "Websites" rather than "Website sites".
   */
  label: string;
  /** One of them: "Instagram page", "Website". */
  labelOne: string;
  /** Landing-page intro. Distinct per platform for search. */
  blurb: string;
  /** The landing page's search description: the blurb in 160 characters. */
  summary: string;
  /**
   * What the Fastest hold means on this platform, in one sentence for the
   * buyer. It follows the handover in `transferSteps`: a YouTube buyer is
   * an owner during Google's wait, an Instagram buyer has the login.
   */
  fastestHold: string;
  /**
   * How ownership actually moves on this platform, in plain language, for
   * anyone: the public pages say "the seller" and "the buyer".
   */
  transferNote: string;
  /**
   * The same, told to the seller listing an account: "You add our agent…".
   * The new-listing form showed them the buyer's side — "You are added with
   * full control… and the seller removes themselves".
   */
  sellerNote: string;
  /** A Fastest deal's holding period, in days: how long the buyer is a
   *  manager before being made primary owner and the seller is paid. */
  holdDays: number;
  /**
   * Buyer-facing handover checklist shown on every listing for this platform.
   * Every deal goes through our agent: the seller hands the account to our
   * agent, and our agent hands it to the buyer. It said "Seller runs
   * Transfer Ownership to your account", as though the seller and the buyer
   * dealt with each other.
   */
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
    searchPlaceholder: "Try “monetized tech channel, 100K+ subs”",
    assetNoun: "channels",
    noun: "channel",
    label: "YouTube channels",
    labelOne: "YouTube channel",
    blurb:
      "Monetized and faceless YouTube channels with verified watch time, revenue history and a clean strike record. Every channel is checked for ownership before it is listed, and we confirm whether it sits on a Brand Account before a sale can start.",
    summary:
      "Buy monetized and faceless YouTube channels with verified watch time, revenue and strike record. Ownership is checked before a channel is listed.",
    fastestHold:
      "On Fastest we hold your payment for 7 days while you are an owner, then the seller is paid and our agent makes you primary owner.",
    transferNote:
      "A Brand Account channel moves cleanly: the seller invites our agent as owner, and after Google’s 7-day waiting period our agent becomes primary owner. Our agent then invites you, and makes you primary owner once Google’s 7 days have passed for you too. Channels on a personal Google account cannot be transferred this way, so we flag them separately.",
    sellerNote:
      "You invite our agent’s Google account as an owner. After Google’s 7-day wait, you make our agent primary owner, and our agent hands the channel to the buyer. Only a channel on a Brand Account can move this way.",
    holdDays: 7,
    transferSteps: [
      "Seller invites our agent’s Google account as an owner",
      "Google’s 7-day waiting period passes before ownership can move",
      "Seller makes our agent primary owner of the Brand Account",
      "Our agent invites your Google account as an owner — Google makes you wait 7 days too",
      "Our agent makes you primary owner and removes the seller",
      "You change the recovery email and phone, then enable 2FA",
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
    searchPlaceholder: "Try “fashion page, 500K followers, India”",
    assetNoun: "pages",
    noun: "page",
    label: "Instagram pages",
    labelOne: "Instagram page",
    blurb:
      "Instagram pages across fashion, fitness, food and travel, with real engagement figures and audience-country breakdowns. Follower counts are checked against engagement so inflated accounts do not reach this page.",
    summary:
      "Buy Instagram pages in fashion, fitness, food and travel. Engagement and audience countries are checked, so inflated accounts never reach the list.",
    fastestHold:
      "On Fastest we hold your payment for 21 days after the login is yours, because a previous owner can try to recover the page for weeks. Then the seller is paid.",
    transferNote:
      "Instagram has no ownership transfer, so the login moves instead. The seller sends our agent the login, our agent moves the email, phone and two-factor to Channel Adda, then hands the account to the buyer. Instagram deals have our longest hold, because a past owner can try to recover an account for weeks.",
    sellerNote:
      "Instagram has no ownership transfer, so you send our agent the login. Our agent moves the email, phone and two-factor to Channel Adda, you remove the account from your Meta Accounts Center, and our agent hands it to the buyer.",
    holdDays: 21,
    transferSteps: [
      "Seller sends our agent the login",
      "Our agent moves the email, phone and two-factor to Channel Adda",
      "Seller removes the account from their Meta Accounts Center",
      "Our agent changes the email to yours and sends you the password",
      "You set your own password, recovery phone and two-factor",
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
    searchPlaceholder: "Try “monetized page, in-stream ads enabled”",
    assetNoun: "pages",
    noun: "page",
    label: "Facebook pages",
    labelOne: "Facebook page",
    blurb:
      "Facebook Pages with in-stream ads and reels bonuses already switched on, plus the linked groups that often come with them. Monetization status is verified from the payouts dashboard, not a screenshot.",
    summary:
      "Buy Facebook Pages with in-stream ads and reels bonuses switched on. Monetization is verified from the payouts dashboard, not from a screenshot.",
    fastestHold:
      "On Fastest we hold your payment for 7 days after you have full control of the Page, then the seller is paid.",
    transferNote:
      "A Page moves the official way, through Meta Business Suite. The seller adds our agent to the Page with full control, then leaves it, and our agent gives the buyer full control.",
    sellerNote:
      "A Page moves the official way, through Meta Business Suite. You add our agent’s Facebook account to the Page with full control, then remove yourself from the Page and your Business Manager. Our agent then gives the buyer full control.",
    holdDays: 7,
    transferSteps: [
      "Seller adds our agent to the Page with full control in Business Suite",
      "Seller leaves the Page and takes it out of their Business Manager",
      "Our agent checks only they have control of the Page",
      "Our agent gives your Facebook account full control of the Page",
      "You check the Page settings and the payouts dashboard",
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
    searchPlaceholder: "Try “crypto signals channel, 50K members”",
    assetNoun: "channels",
    noun: "channel",
    label: "Telegram channels",
    labelOne: "Telegram channel",
    blurb:
      "Telegram channels with high open rates and, in many cases, an existing paid-sponsorship pipeline. Member counts and post reach are verified before listing.",
    summary:
      "Buy Telegram channels with high open rates and, often, paid sponsorships already running. Member counts and post reach are verified before listing.",
    fastestHold:
      "On Fastest we hold your payment for 3 days after the channel is transferred to you, then the seller is paid.",
    transferNote:
      "Telegram has a real Transfer Ownership button, which makes this the quickest handover here. The seller transfers the channel to our agent, and our agent transfers it to the buyer. A finished transfer cannot be undone, so the Fastest hold is only three days.",
    sellerNote:
      "You make our agent’s Telegram account an admin of the channel, then use Transfer Ownership to make our agent the owner. Our agent then transfers it to the buyer. Turn on two-step verification well before: Telegram asks for it before it lets you transfer.",
    holdDays: 3,
    transferSteps: [
      "Seller makes our agent an admin of the channel",
      "Seller uses Transfer Ownership to make our agent the owner",
      "Our agent checks they own the channel",
      "Our agent transfers ownership to your Telegram account",
      "You check you are the only owner",
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
    searchPlaceholder: "Try “AdSense blog, $500/mo revenue”",
    assetNoun: "sites",
    noun: "site",
    label: "Websites",
    labelOne: "Website",
    blurb:
      "Content websites and blogs with organic search traffic, email lists and affiliate or display-ad income. Traffic is verified from analytics, and we confirm the domain is outside its transfer lock before a deal opens.",
    summary:
      "Buy content websites and blogs with organic traffic, email lists and ad or affiliate income. Traffic is verified from analytics before a deal opens.",
    fastestHold:
      "On Fastest we hold your payment for 14 days after the domain and the site are moved to you, then the seller is paid.",
    transferNote:
      "A website moves in three parts: the domain, by its auth code; the hosting and database; and the analytics. The seller moves them to our agent, and our agent moves them to the buyer. AdSense income does not transfer, so the buyer connects their own account.",
    sellerNote:
      "A website moves in three parts: the domain (you unlock it and send our agent the auth code), the hosting and database, and the analytics. You move them to our agent, and our agent moves them to the buyer. AdSense does not transfer: the buyer connects their own.",
    holdDays: 14,
    transferSteps: [
      "Seller gives our agent access to the hosting and the site’s admin",
      "Seller unlocks the domain and transfers it to our agent",
      "Our agent checks the domain, hosting, traffic and income",
      "Our agent moves the domain, hosting and analytics to you",
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

/**
 * The asset's one word for a platform given either way it is stored — the
 * route's "instagram" or the database's "INSTAGRAM". "account" for anything
 * unknown, which is true of every platform.
 */
export function platformNoun(platform: string): string {
  return platformMap[platform.toLowerCase() as PlatformId]?.noun ?? "account";
}
