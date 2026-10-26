import type { Platform, PlatformId } from "@/data/platforms";

/**
 * What each platform's buy and sell pages say to a search engine, and the
 * questions folded at their foot.
 *
 * Kept apart from `data/platforms` because these are written for search —
 * "Buy YouTube channels", the words people type — where the platform data
 * is written for members in the middle of a deal. The answers are built
 * from that data, so a change to a handover or a hold reaches them too.
 */

type Faq = { question: string; answer: string };

const BUY_TITLES: Record<PlatformId, string> = {
  youtube: "Buy YouTube Channels — Monetized Channels for Sale",
  instagram: "Buy Instagram Accounts & Pages for Sale",
  facebook: "Buy Facebook Pages for Sale — Monetized Pages",
  telegram: "Buy Telegram Channels for Sale",
  website: "Buy Websites & Blogs for Sale",
};

const SELL_TITLES: Record<PlatformId, string> = {
  youtube: "Sell Your YouTube Channel Safely — Free Listing",
  instagram: "Sell Your Instagram Account Safely — Free Listing",
  facebook: "Sell Your Facebook Page Safely — Free Listing",
  telegram: "Sell Your Telegram Channel Safely — Free Listing",
  website: "Sell Your Website or Blog Safely — Free Listing",
};

/** The search-result title of a platform's page of listings. */
export function buyTitle(platform: Platform): string {
  return BUY_TITLES[platform.id];
}

/** The search-result title of a platform's page for sellers. */
export function sellTitle(platform: Platform): string {
  return SELL_TITLES[platform.id];
}

/** "YouTube channel", but "website" mid-sentence. */
function one(platform: Platform): string {
  return platform.id === "website" ? "website" : platform.labelOne;
}

/** "a YouTube channel", "an Instagram page". */
function aOne(platform: Platform): string {
  const name = one(platform);
  return `${/^[aeiou]/i.test(name) ? "an" : "a"} ${name}`;
}

/** "YouTube channels", but "websites" mid-sentence. */
function many(platform: Platform): string {
  return platform.id === "website" ? "websites" : platform.label;
}

export function sellDescription(platform: Platform): string {
  return `Sell your ${one(platform)} on Channel Adda. Free to list, real buyers, and our agent holds the money or the ${platform.noun} until the handover is done.`;
}

/** What happens to the income, on each platform, after a sale. */
const INCOME: Record<PlatformId, string> = {
  youtube:
    "The channel keeps its videos, subscribers and monetization status, but AdSense does not move with it: you link your own AdSense account after the handover. YouTube can review a channel's monetization again after the owner changes.",
  instagram:
    "Brand deals and creator payouts belong to the seller, not the page. You set up your own payout details, and any brand that wants to keep working with the page makes a new agreement with you.",
  facebook:
    "In-stream ads and other monetization tools stay switched on for the Page, but payouts go to the payout account set in its settings, so you add your own. Meta can review a Page again after the people running it change.",
  telegram:
    "Sponsorship deals are agreements with the seller, not part of the channel. Ask the seller in the chat which advertisers are likely to stay, and agree with them yourself after the handover.",
  website:
    "AdSense and most ad networks do not transfer: you connect your own account. Affiliate accounts are usually in the seller's name too, so plan to apply to those programmes yourself.",
};

/** The handover's length, as a buyer would ask it. */
function handoverTime(platform: Platform): string {
  if (platform.id === "youtube") {
    return "Google makes every new owner of a Brand Account wait 7 days before they can become primary owner. The seller's handover to our agent takes those 7 days, and your own takes 7 more, so plan for about two weeks from the start of a deal.";
  }
  return `${platform.fastestHold} On a Safest deal our agent takes the ${platform.noun} first, so the time depends mostly on how quickly the seller hands it to our agent.`;
}

/** Questions a buyer asks on a platform's page of listings. */
export function buyFaqs(platform: Platform): Faq[] {
  const noun = platform.noun;
  return [
    {
      question: `Is it safe to buy ${aOne(platform)} on Channel Adda?`,
      answer: `Every deal goes through our agent, so you never send money to a stranger and hope. On a Fastest deal you pay us and we hold it. On a Safest deal our agent takes the ${noun} from the seller before you pay the seller anything. If the handover fails, you open a dispute and nothing moves until a moderator decides.`,
    },
    {
      question: `How long does it take to buy ${aOne(platform)}?`,
      answer: handoverTime(platform),
    },
    {
      question:
        platform.id === "youtube"
          ? "Does the monetization and AdSense come with the channel?"
          : `Does the income come with the ${noun}?`,
      answer: INCOME[platform.id],
    },
    {
      question: "How do I know the seller really owns it?",
      answer: `Before a listing goes live, the seller puts a one-time code in ${platform.ownershipCheck.place}. ${
        platform.ownershipCheck.automatic
          ? "We read it back from YouTube automatically."
          : "A moderator opens the account and checks it is there."
      } Ask the seller for anything else in the chat before you start a deal.`,
    },
    {
      question: "What is the difference between Fastest and Safest?",
      answer: `On Fastest you pay the full price to Channel Adda up front and we pay the seller after the hold. On Safest you pay only our fee up front, our agent holds the ${noun}, and then you pay the seller directly. The fees for each are on the fees page.`,
    },
  ];
}

/** Questions a seller asks on a platform's page for sellers. */
export function sellFaqs(platform: Platform): Faq[] {
  const noun = platform.noun;
  return [
    {
      question: `How do I sell my ${one(platform)}?`,
      answer: `Create a free listing with the link, the numbers and your price, then prove you own it by pasting a one-time code in ${platform.ownershipCheck.place}. When a buyer starts a deal, you hand the ${noun} to our agent, not to the buyer, and our agent hands it on.`,
    },
    {
      question: "Does it cost anything to list?",
      answer:
        "No. Listing is free and there is no exclusivity, so you can list elsewhere too. A fee is taken only when a deal completes; the current rates are on the fees page.",
    },
    {
      question: "When and how do I get paid?",
      answer: `On a Fastest deal the buyer has already paid us, and the sale amount lands in your Channel Adda wallet once our agent holds the ${noun}; you withdraw it to your own crypto wallet. On a Safest deal the buyer pays you directly, to the details you give on the deal, and you press Received when it arrives.`,
    },
    {
      question: `Can a buyer take the ${noun} without paying?`,
      answer: `No. You never hand the ${noun} to the buyer yourself. On a Fastest deal the money is with us before you move anything, and on a Safest deal our agent only hands the ${noun} over after you confirm you were paid.`,
    },
    {
      question: "How should I price it?",
      answer: `Look at what similar ${many(platform)} sold for on our recently sold page, and at live listings in your niche. Steady income, a real audience and a clean history raise the price; buyers can make offers, and you can accept, decline or counter in the chat.`,
    },
  ];
}
