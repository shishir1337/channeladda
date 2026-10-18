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
    blurb: "Paying, holds, confirming a handover.",
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
    slug: "how-a-deal-is-protected",
    title: "How a deal is protected",
    category: "buying",
    summary:
      "Where your payment sits between checkout and payout, and what triggers a refund.",
    body: [
      "On both kinds of deal your payment goes to us, never to the seller, and reaches the seller only once the account is yours. On a Fastest deal you pay it all up front and the seller hands the account to you directly while our agent watches. On a Safest deal we hold the account as well — one of our agents takes ownership of it before you pay anything but our fee, and you pay the price to us once it is verifiably in our hands.",
      "Either way the gap is deliberate. Handing over a login is not the same as losing access forever: on several platforms a previous owner can attempt account recovery for days or weeks afterwards. Something has to sit between the two sides until that window closes — on a Fastest deal it is your money, on a Safest deal it is the account itself.",
      "If the handover fails at any point, you open a dispute and the deal freezes where it stands. Nothing moves until a moderator has read the order record and decided. What that can recover: on a Fastest deal we are holding your money and can return it. On a Safest deal we are holding the account, and the price once you have paid it, so a dispute can return the channel to the seller and the price to you. Our admin fee is kept once an agent has held the account — it paid for that work.",
    ],
    steps: [
      "You pay Channel Adda — the whole amount up front on a Fastest deal; on a Safest deal our fee first, and the price once our agent holds the account",
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
      "Buyers pay the listing price plus a platform fee — the current rate is on the fees page, and it can differ between Safest and Fastest. The total is shown in full on the listing page before you commit to anything — there is never a number that appears for the first time at checkout.",
      "The fee is charged when the deal opens. On a Fastest deal a full refund returns the fee with it. On a Safest deal the fee comes back on its own if the deal dies before one of our agents takes custody of the account; after that it has paid for work that was actually done.",
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
      "We check the code when you submit it, and a moderator checks the live account again before the listing goes public. Leave the code up until it is approved: a code that was there three weeks ago proves nothing about today.",
      "You can remove the code once the listing is approved.",
    ],
  },
  {
    slug: "getting-paid",
    title: "Getting paid",
    category: "selling",
    summary: "Payout timing, the seller fee, and withdrawal security.",
    body: [
      "The buyer paid us, so we pay you, on both kinds of deal. While the deal runs, the price shows in your wallet under Held for your sales. When the transfer completes — after the cooling-off period on a Fastest deal, after Google's second waiting period on a Safest one — the sale amount, less the seller fee if one is set (check /fees), lands in your Channel Adda balance. You then withdraw to your own crypto wallet, usually within the hour.",
      "For your own protection, adding or changing a payout address locks withdrawals for 24 hours and sends you an email. Address-change attacks are the most common way marketplace sellers lose money, and this delay is what stops them.",
    ],
  },
  {
    slug: "opening-a-dispute",
    title: "Opening a dispute",
    category: "trust",
    summary: "When to open one, what we look at, and how long it takes.",
    body: [
      "Open a dispute from the deal page the moment something looks wrong — the seller goes quiet, the transfer stalls, or the account is recovered after handover. The deal freezes where it stands, the account stays with our agent if it is there, and the money we hold for it stays with us — it is not in the seller's balance until the deal completes, so it cannot be withdrawn while the dispute is open.",
      "A moderator reviews the whole order record: every message, every proof upload, the transfer checklist with timestamps, and a live check of who controls the account now. Nobody has to take anyone's word for anything.",
      "We aim to respond within 48 hours and decide within seven days. A dispute has two outcomes: the deal completes, or it is reversed — the account goes on to the buyer, or back to the seller with the money we hold returned to the buyer. We do not split a deal down the middle, because half an account is not a thing anybody can own.",
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
      "Turn on two-factor authentication, especially if you sell. It is the single thing that stops a leaked password becoming a withdrawal to somebody else's wallet.",
      "Channel Adda staff will never ask for your password, your two-factor codes, or your recovery email. We will never ask you to move a conversation to Telegram or WhatsApp to complete a deal — anyone who does is not from Channel Adda, and no deal arranged that way is protected.",
    ],
  },
];

export const helpArticleMap = Object.fromEntries(
  helpArticles.map((a) => [a.slug, a]),
) as Record<string, HelpArticle>;
