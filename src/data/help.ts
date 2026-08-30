export type HelpArticle = {
  slug: string;
  title: string;
  category: string;
  /** Shown under the title in listings and as the meta description. */
  summary: string;
  /** Body paragraphs. Kept as prose rather than markdown so it renders
   *  without a parser and stays typed. */
  body: string[];
  /** Optional ordered checklist rendered after the body. */
  steps?: string[];
};

export const helpCategories = [
  {
    id: "buying",
    label: "Buying",
    blurb: "Paying, escrow, confirming a handover.",
  },
  {
    id: "selling",
    label: "Selling",
    blurb: "Listing, verification, getting paid.",
  },
  {
    id: "trust",
    label: "Trust & disputes",
    blurb: "What happens when something goes wrong.",
  },
  { id: "account", label: "Your account", blurb: "Sign-in, KYC, settings." },
];

export const helpArticles: HelpArticle[] = [
  {
    slug: "how-escrow-protects-your-money",
    title: "How escrow protects your money",
    category: "buying",
    summary:
      "Where your payment sits between checkout and payout, and what triggers a refund.",
    body: [
      "When you buy an account on Channel Adda, your payment goes to us — not to the seller. It stays there while the handover happens, and it is only released once you have confirmed you have full control and the cooling-off period for that platform has passed.",
      "That gap is deliberate. Handing over a login is not the same as losing access forever: on several platforms a previous owner can attempt account recovery for days or weeks afterwards. If we paid the seller the moment you clicked confirm, that money would be gone before you discovered a problem.",
      "If the handover fails at any point, you open a dispute and the money freezes where it is. Nothing is released until a moderator has read the order record and decided.",
    ],
    steps: [
      "You pay — funds are held by Channel Adda",
      "The seller starts the transfer, working a platform-specific checklist",
      "You verify and confirm you have full control",
      "The cooling-off period passes",
      "The seller is paid",
    ],
  },
  {
    slug: "what-you-pay-and-when",
    title: "What you pay, and when",
    category: "buying",
    summary: "The buyer fee, when it is charged, and what happens on a refund.",
    body: [
      "Buyers pay the listing price plus a 3% platform fee. The total is shown in full on the listing page before you commit to anything — there is never a number that appears for the first time at checkout.",
      "The fee is charged at the same time as the purchase. If a deal is refunded in full, the fee is refunded with it. If a dispute ends in a partial settlement, the fee is adjusted to match the amount actually settled.",
    ],
  },
  {
    slug: "confirming-a-handover",
    title: "Confirming a handover safely",
    category: "buying",
    summary:
      "What to check before you press confirm, and why confirming does not pay the seller straight away.",
    body: [
      "Confirming means you have full, uncontested control of the account. Before you press it, work through the checklist on your order — it is different for every platform, because every platform transfers ownership differently.",
      "Confirming does not release the money. It starts the cooling-off period, which runs from three days on Telegram to twenty-one on Instagram. You keep the right to open a dispute for that entire window.",
    ],
    steps: [
      "Change the recovery email to one only you control",
      "Change the recovery phone number",
      "Enable two-factor authentication",
      "Check the permissions page and confirm the seller is gone",
      "Sign out everywhere and sign back in",
    ],
  },
  {
    slug: "listing-an-account",
    title: "Listing an account",
    category: "selling",
    summary: "What we ask for, why we ask, and how long approval takes.",
    body: [
      "Listing is free and takes about ten minutes. You add the handle, the audience figures, your asking price, and screenshots of the analytics and any revenue.",
      "We also ask how your account is set up — for example, whether a YouTube channel sits on a Brand Account or a personal Google account. That single answer decides whether the transfer is a two-hour job or something we may not be able to support at all, so it is worth getting right.",
      "Once submitted, a moderator reviews the listing. Most are approved within a few hours. A rejection always comes with a specific reason and a link straight back to fix it.",
    ],
  },
  {
    slug: "verifying-ownership-with-a-code",
    title: "Verifying ownership with a code",
    category: "selling",
    summary:
      "The one-time code you place in your bio or description, and why we check it more than once.",
    body: [
      "We generate a one-time code and ask you to paste it into your channel description or profile bio. Our system then reads the live account and checks the code is there. A screenshot can be edited; a live read cannot.",
      "We check the code three times: when you submit, again just before the listing goes public, and again the moment a buyer opens an order. A code that passed three weeks ago proves nothing about today, and buyers are paying for certainty.",
      "You can remove the code once the listing is approved.",
    ],
  },
  {
    slug: "getting-paid",
    title: "Getting paid",
    category: "selling",
    summary: "Payout timing, the seller fee, and withdrawal security.",
    body: [
      "When a buyer confirms the handover and the cooling-off period ends, the sale amount minus the 5% seller fee lands in your Channel Adda balance. You then withdraw to your own crypto wallet, usually within the hour.",
      "For your own protection, adding or changing a payout address locks withdrawals for 24 hours and sends you an email. Address-change attacks are the most common way marketplace sellers lose money, and this delay is what stops them.",
    ],
  },
  {
    slug: "opening-a-dispute",
    title: "Opening a dispute",
    category: "trust",
    summary: "When to open one, what we look at, and how long it takes.",
    body: [
      "Open a dispute from your order page the moment something looks wrong — the seller goes quiet, the transfer stalls, or the account is recovered after handover. Escrow freezes immediately and the seller cannot withdraw anything.",
      "A moderator reviews the whole order record: every message, every proof upload, the transfer checklist with timestamps, and a live check of who controls the account now. Nobody has to take anyone's word for anything.",
      "We aim to respond within 48 hours and decide within seven days. The outcome is a full release, a full refund, or a split where both sides carry part of the loss.",
    ],
  },
  {
    slug: "why-revenue-does-not-transfer",
    title: "Why revenue does not transfer with an account",
    category: "trust",
    summary:
      "The most common misunderstanding in this market, explained before you buy.",
    body: [
      "A listing that says it earns $3,000 a month is telling you what that audience earns — not that the income arrives with the account. Advertising revenue is paid to the owner's own ad account, which is tied to their tax identity and cannot be sold or transferred.",
      "After a handover you connect your own ad account and apply again. Approval is usually straightforward on an established account, but it is a separate process with its own timeline, and the platform can re-review the account as part of it.",
      "We show this warning on every listing that quotes a revenue figure, and you have to acknowledge it at checkout. Lost monetization on its own is not grounds for a refund, because it is disclosed before you pay.",
    ],
  },
  {
    slug: "verification-and-kyc",
    title: "Verification and KYC",
    category: "account",
    summary: "Who has to verify their identity, and at what point.",
    body: [
      "Browsing, searching and saving listings need nothing more than an email address. You can create an account in about fifteen seconds.",
      "Sellers complete an identity check before their first listing goes live: a government ID and a liveness check. We ban by document, not by email address, so someone removed for fraud cannot simply sign up again.",
      "Buyers are only asked to verify on a single purchase above $2,000.",
    ],
  },
  {
    slug: "keeping-your-account-secure",
    title: "Keeping your account secure",
    category: "account",
    summary: "Two-factor, payout addresses, and how we will never contact you.",
    body: [
      "Turn on two-factor authentication, especially if you sell. It is required before you can withdraw.",
      "Channel Adda staff will never ask for your password, your two-factor codes, or your recovery email. We will never ask you to move a conversation to Telegram or WhatsApp to complete a deal — anyone who does is not from Channel Adda, and no deal arranged that way is protected.",
    ],
  },
];

export const helpArticleMap = Object.fromEntries(
  helpArticles.map((a) => [a.slug, a]),
) as Record<string, HelpArticle>;
