export type Service = {
  slug: string;
  title: string;
  /** One-line summary used on cards. */
  description: string;
  icon: string;
  /** Indicative starting price in USD. */
  fromPrice: number;
  turnaround: string;
  /** Longer pitch for the detail page. */
  body: string;
  includes: string[];
  /** Stated plainly where a service carries real platform risk. */
  caution?: string;
};

export const services: Service[] = [
  {
    slug: "channel-promotion",
    title: "Channel promotion",
    description: "Targeted campaigns to lift reach before or after a sale.",
    icon: "megaphone",
    fromPrice: 250,
    turnaround: "7–14 days",
    body: "Paid and organic promotion aimed at the audience you actually want, run by people who know the niche. Most sellers use this to lift engagement before listing; most buyers use it to accelerate a channel they have just taken over.",
    includes: [
      "Audience and competitor research",
      "Creative and thumbnail testing",
      "Paid placement management",
      "Weekly reporting against agreed targets",
    ],
  },
  {
    slug: "ai-video-production",
    title: "AI video production",
    description: "Faceless scripts, voiceover and edits delivered weekly.",
    icon: "clapperboard",
    fromPrice: 180,
    turnaround: "Weekly batches",
    body: "A full faceless production line: research, script, synthetic voiceover, edit and thumbnail. Built for buyers who acquire a faceless channel and need to keep the upload schedule running from day one.",
    includes: [
      "Niche research and content calendar",
      "Scripted, fact-checked episodes",
      "Licensed voiceover and stock footage",
      "Thumbnails and metadata",
    ],
  },
  {
    slug: "silver-code-request",
    title: "Silver code request",
    description:
      "Creator award claims handled end to end for eligible channels.",
    icon: "award",
    fromPrice: 120,
    turnaround: "3–6 weeks",
    body: "If a channel has crossed the award threshold, the claim still has to be filed correctly and the address verified. We handle the paperwork and follow up until the code is issued.",
    includes: [
      "Eligibility check against the channel",
      "Claim submission and address verification",
      "Follow-up until the code is issued",
    ],
    caution:
      "Awards are issued by the platform at its discretion. We can only file a correct claim — nobody can guarantee approval.",
  },
  {
    slug: "subscribers-watch-time",
    title: "Subscribers & watch time",
    description:
      "Monetization thresholds reached with retention-safe delivery.",
    icon: "trending-up",
    fromPrice: 300,
    turnaround: "14–30 days",
    body: "Growth campaigns aimed at the subscriber and watch-hour thresholds a channel needs before it can apply for monetization, delivered gradually rather than in a spike.",
    includes: [
      "Gradual, paced delivery",
      "Geographic targeting to match the niche",
      "Progress tracking against the threshold",
    ],
    caution:
      "Artificially inflating subscribers or watch time breaches YouTube’s terms and can cost a channel its monetization or the account itself. We will always recommend organic promotion first, and we will not run this on a channel already in the partner programme.",
  },
  {
    slug: "strike-appeal-support",
    title: "Strike & appeal support",
    description:
      "Community-guideline and copyright appeals drafted by specialists.",
    icon: "shield-alert",
    fromPrice: 90,
    turnaround: "48 hours to draft",
    body: "A strike or takedown handled properly the first time. We review what triggered it, draft the appeal, and tell you honestly when an appeal is not worth filing.",
    includes: [
      "Review of the strike and the offending content",
      "Drafted appeal in the platform’s own framing",
      "Guidance on what to change to avoid a repeat",
    ],
    caution:
      "Appeal outcomes are decided by the platform. We improve the odds of a fair review; we cannot overturn a decision.",
  },
  {
    slug: "transfer-assistance",
    title: "Transfer assistance",
    description:
      "A Channel Adda agent runs the handover call with both parties.",
    icon: "arrow-left-right",
    fromPrice: 0,
    turnaround: "Same day",
    body: "For high-value or complicated deals, an agent joins a call with both sides and walks the transfer checklist live — recovery email, two-factor, ownership promotion, the lot. Free on any deal above $10,000.",
    includes: [
      "Scheduled call with buyer and seller",
      "Live walkthrough of the platform checklist",
      "Proof captured at each step onto the order",
      "Immediate escalation if anything looks wrong",
    ],
  },
];

export const serviceMap = Object.fromEntries(
  services.map((s) => [s.slug, s]),
) as Record<string, Service>;

export const faqs = [
  {
    q: "How does Channel Adda protect my money?",
    a: "Every purchase is supervised. On a Safest deal one of our agents takes ownership of the account first, and only then do you pay the seller directly — so the seller cannot take it back or sell it twice — and the account moves to you once they confirm your payment. On a Fastest deal you pay us up front and we release it to the seller only once you are the account's primary owner. Either way, nobody hands over anything on trust.",
  },
  {
    q: "What is the difference between Quick and Safest checkout?",
    a: "Safest means we hold the account: one of our agents takes ownership of it first, you pay the seller directly once it is verifiably in our hands, and when the seller confirms the payment arrived our agent makes you the owner. You pay us only our fee. Fastest means we hold the money: you pay us the price and our fee together, the seller makes you a manager and, after the holding period, primary owner, and we pay the seller once you are. You choose on every listing; there is no price threshold.",
  },
  {
    q: "Which payment methods do you accept?",
    a: "Payments to Channel Adda and payouts are processed in crypto through Cryptomus — USDT, BTC, ETH, TRX and 20+ other assets — and a Fastest seller withdraws to their own wallet once the deal completes. A Safest price goes from the buyer to the seller directly, by whatever method the two of you agree in the deal chat.",
  },
  {
    q: "How do you verify that a seller really owns the account?",
    a: "Sellers place a one-time Channel Adda verification code in the account description or bio, and our system checks it live. On top of that we require KYC, proof screenshots of the analytics and monetization dashboards, and manual admin approval before a listing goes public.",
  },
  {
    q: "What fees does Channel Adda charge?",
    a: "Buyers pay a platform fee, set by us and shown in full on every listing and on the fees page before you commit. On a Fastest deal the price comes to us too; on a Safest deal you pay it to the seller directly, once our agent holds the account. Sellers pay a success fee on a Fastest deal, taken from the price when it completes; there is no cost to create an account or publish a listing.",
  },
  {
    q: "What happens if a transfer goes wrong?",
    a: "Open a dispute from the order page and the deal freezes where it stands while our moderation team reviews the order-linked chat, proof uploads and transfer log. What a decision can recover depends on the deal: on a Fastest deal we are holding your payment and can return it in full. On a Safest deal we are holding the account, and the price too once you have paid it, so a decision can return the channel to the seller and the price to you. The admin fee is kept once our agent has held the account.",
  },
  {
    q: "Can I negotiate the listed price?",
    a: "Yes. Send an offer from any listing and the seller can accept, reject or counter. Everything stays inside Channel Adda chat, so the agreed price and terms are on record if a dispute is ever raised.",
  },
];

export const footerNav: {
  title: string;
  links: { label: string; href: string }[];
}[] = [
  {
    title: "Marketplace",
    links: [
      { label: "Browse all accounts", href: "/browse" },
      { label: "YouTube channels", href: "/browse/youtube" },
      { label: "Instagram pages", href: "/browse/instagram" },
      { label: "Facebook pages", href: "/browse/facebook" },
      { label: "Telegram channels", href: "/browse/telegram" },
      { label: "Websites & blogs", href: "/browse/website" },
      { label: "Recently sold", href: "/sold" },
    ],
  },
  {
    title: "Sell",
    links: [
      { label: "Create a listing", href: "/sell" },
      { label: "Pricing & fees", href: "/fees" },
      { label: "Listing rules", href: "/listing-rules" },
      { label: "Verified sellers", href: "/sellers" },
      { label: "Services", href: "/services" },
      { label: "Affiliates", href: "/affiliates" },
    ],
  },
  {
    title: "Trust & safety",
    links: [
      { label: "How a deal works", href: "/how-it-works" },
      { label: "Trust & safety", href: "/trust-safety" },
      { label: "KYC verification", href: "/aml-kyc" },
      { label: "Dispute resolution", href: "/help/opening-a-dispute" },
      { label: "Refund policy", href: "/refunds" },
      { label: "Transfer checklist", href: "/help/confirming-a-handover" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Channel Adda", href: "/about" },
      { label: "Help centre", href: "/help" },
      { label: "Contact support", href: "/support" },
      { label: "Sign in", href: "/signin" },
      { label: "Create an account", href: "/signup" },
    ],
  },
];
