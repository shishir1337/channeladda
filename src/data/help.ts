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
      "What protects you depends on which deal you chose, and the two work in opposite directions. On a Fastest deal your payment goes to us, not to the seller: it stays with us while the handover happens and reaches the seller only once you have confirmed you have full control. On a Safest deal we hold the account instead — one of our agents takes ownership of it before you pay anything but our fee, and you pay the seller directly once it is verifiably in our hands.",
      "Either way the gap is deliberate. Handing over a login is not the same as losing access forever: on several platforms a previous owner can attempt account recovery for days or weeks afterwards. Something has to sit between the two sides until that window closes — on a Fastest deal it is your money, on a Safest deal it is the account itself.",
      "If the handover fails at any point, you open a dispute and the deal freezes where it stands. Nothing moves until a moderator has read the order record and decided. Be clear about what that can recover: on a Fastest deal we are holding your money and can return it. On a Safest deal we are holding the account and can return that — but the price went straight from you to the seller and we were never holding it, so what a dispute can give you back is the channel, not the payment. That is the trade you are making when you choose to pay the seller direct.",
    ],
    steps: [
      "You pay — on a Fastest deal we hold the money; on a Safest deal just our fee, and the account is held instead",
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
      "The fee is charged when the deal opens. On a Fastest deal a full refund returns the fee with it. On a Safest deal the fee comes back on its own if the deal dies before one of our agents takes custody of the account; after that it has paid for work that was actually done. A partial settlement adjusts it to match the amount settled.",
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
      "This is a Fastest deal: the buyer paid us, so we pay you. When they confirm the handover and the cooling-off period ends, the sale amount — less the seller fee, if one is set, which you can check at /fees — lands in your Channel Adda balance. You then withdraw to your own crypto wallet, usually within the hour. On a Safest deal nothing lands here at all, because the buyer pays you directly.",
      "For your own protection, adding or changing a payout address locks withdrawals for 24 hours and sends you an email. Address-change attacks are the most common way marketplace sellers lose money, and this delay is what stops them.",
    ],
  },
  {
    slug: "opening-a-dispute",
    title: "Opening a dispute",
    category: "trust",
    summary: "When to open one, what we look at, and how long it takes.",
    body: [
      "Open a dispute from the deal page the moment something looks wrong — the seller goes quiet, the transfer stalls, or the account is recovered after handover. The deal freezes where it stands, the account stays with our agent if it is there, and the seller cannot withdraw a balance held with us.",
      "A moderator reviews the whole order record: every message, every proof upload, the transfer checklist with timestamps, and a live check of who controls the account now. Nobody has to take anyone's word for anything.",
      "We aim to respond within 48 hours and decide within seven days. A dispute has two outcomes: the deal completes, or it is reversed — the account goes on to the buyer, or back to the seller and, on a Fastest deal, the money back to the buyer. We do not split a deal down the middle, because half an account is not a thing anybody can own.",
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
