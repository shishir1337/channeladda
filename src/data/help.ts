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
      "On a Fastest deal you pay it all to us up front, never to the seller. The seller hands the account to our agent, our agent invites you as owner, and after the holding period we pay the seller and our agent makes you primary owner. On a Safest deal we hold the account instead — one of our agents takes ownership of it before you pay anything but our fee — and only then do you pay the seller the price directly, to the details the seller gives on the deal.",
      "Either way the gap is deliberate. Handing over a login is not the same as losing access forever: on several platforms a previous owner can attempt account recovery for days or weeks afterwards. Something has to sit between the two sides until that window closes — on a Fastest deal it is your money, on a Safest deal it is the account itself.",
      "If the handover fails at any point, you open a dispute and the deal freezes where it stands. Nothing moves until a moderator has read the order record and decided. What that can recover: on a Fastest deal, until our agent holds the account, we are holding your money and can return it; after that the seller has been paid, and our agent finishes the handover. On a Safest deal we are holding the account: if you paid the seller and they will not confirm it, the moderator decides on the record — when you pressed Paid, and the proof in the chat — and our agent can hand you the account. Our admin fee is kept once an agent has held the account — it paid for that work.",
    ],
    steps: [
      "You pay Channel Adda — the whole amount on a Fastest deal, only our fee on a Safest deal",
      "The seller invites our agent as owner, and on a Fastest deal our agent invites you",
      "The waiting period passes, and our agent becomes primary owner",
      "On a Fastest deal that is when we pay the seller. On a Safest deal our agent verifies the account, you pay the seller directly, and they confirm it arrived",
      "Our agent invites you as owner and then makes you primary owner, and the deal completes. On a Safest deal Google's 7-day wait runs again in between, on YouTube",
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
    title: "Checking a handover safely",
    category: "buying",
    summary: "What to check once our agent has transferred the account to you.",
    body: [
      "Our agent does the transfer, so there is no button for you to press. Once the account is yours, check you have full, uncontested control by working through the checklist on your order — it is different for every platform, because every platform transfers ownership differently. If anything is wrong, say so in the deal chat straight away.",
      "On a Fastest deal you are an owner through the holding period — from three days on Telegram to twenty-one on Instagram — so you can look around the account before it is yours. You keep the right to open a dispute until the deal completes.",
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
      "A YouTube listing goes live as soon as our system finds your ownership code on the channel. On every other platform a moderator reviews the listing first; most are approved within a few hours. A rejection always comes with a specific reason and a link straight back to fix it.",
    ],
  },
  {
    slug: "verifying-ownership-with-a-code",
    title: "Verifying ownership with a code",
    category: "selling",
    summary:
      "The one-time code you place in your bio or description, and why we check it more than once.",
    body: [
      "We generate a one-time code and ask you to paste it into your channel description or profile bio. On YouTube our system reads the live channel and checks the code is there; on every other platform a moderator opens the live account and looks. A screenshot can be edited; the live account cannot.",
      "On YouTube the listing goes live as soon as the code is found. Elsewhere a moderator checks the live account before the listing goes public, so leave the code up until it is approved: a code that was there three weeks ago proves nothing about today.",
      "You can remove the code once the listing is live.",
    ],
  },
  {
    slug: "rating-points-and-the-reseller-badge",
    title: "Rating points and the Reseller badge",
    category: "trust",
    summary:
      "How points are earned from deals, and what the Reseller badge adds.",
    body: [
      "Every deal that completes earns rating points for both sides: half of what the deal was worth, in US dollars. A $500 deal is 250 points for the buyer and 250 for the seller. Points come from completed deals only, so they cannot be typed in or bought one by one, and they show on your profile and to anyone you are dealing with.",
      "The Reseller badge is bought 30 days at a time from your wallet, from your balance or with crypto. While it is active it shows beside your name, your rating points count {multiplier} times — 250 becomes {multiplied250} — and every Channel Adda fee you pay is {discount}% lower. When it ends your points count once again and fees go back to normal; a deal keeps the fee it was opened at.",
      "You hold one badge at a time: once it has ended you can take it again for another 30 days. We remind you three days before it ends.",
    ],
  },
  {
    slug: "getting-paid",
    title: "Getting paid",
    category: "selling",
    summary: "Payout timing, the seller fee, and withdrawal security.",
    body: [
      "On a Fastest deal the buyer paid us, so we pay you. While the deal runs, the price shows in your wallet under Held for your sales; once our agent holds the account, the sale amount, less the seller fee if one is set (check /fees), lands in your Channel Adda balance, and you withdraw it to your own crypto wallet once our finance team approves the payout. On a Safest deal the buyer pays you directly, to the details you give on the deal, once our agent holds the account — press Received when it arrives, and only then does our agent transfer it to them.",
      "For your own protection, adding or changing a payout address locks withdrawals for 24 hours and sends you an email. Address-change attacks are the most common way marketplace sellers lose money, and this delay is what stops them.",
    ],
  },
  {
    slug: "opening-a-dispute",
    title: "Opening a dispute",
    category: "trust",
    summary: "When to open one, what we look at, and how long it takes.",
    body: [
      "Open a dispute from the deal page the moment something looks wrong — the seller goes quiet, the transfer stalls, a payment you made is not confirmed, or the account is recovered after handover. The deal freezes where it stands, the account stays with our agent if it is there, and any money we still hold for it stays with us, where nobody can withdraw it while the dispute is open.",
      "A moderator reviews the whole order record: every message, every proof upload, the transfer checklist with timestamps, and a live check of who controls the account now. Nobody has to take anyone's word for anything.",
      "A moderator reviews it within 24 hours and decides within seven days. A dispute has two outcomes: the deal completes, or it is reversed — the account goes on to the buyer, or back to the seller with the money we hold returned to the buyer. We do not split a deal down the middle, because half an account is not a thing anybody can own.",
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
    summary: "The Verified badge: it is optional, and this is how to get it.",
    body: [
      "Browsing, buying and selling need nothing more than an email address. You can create an account in about fifteen seconds.",
      "Getting verified is optional. It only adds the Verified badge beside your name, so buyers and sellers know a real person is behind your account.",
      'To get it, open Verification in your dashboard. Send a photo of your Aadhaar card, PAN card, passport or other government ID, and a short selfie video holding the same ID, saying your name and "Channel Adda".',
      "A person on our team checks it, usually within 24 hours. Only our verification team sees your documents, and they are never shown on your profile. If we cannot verify you, we tell you why and you can try again.",
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
      "Need help? Signed in, open Messages and write to the Escrow Agent, pinned at the top: that chat goes to Channel Adda's own agents, and it only ever happens inside Messages. Somebody calling themselves an Escrow Agent anywhere else is not us. Signed out, use the support form.",
    ],
  },
];

export const helpArticleMap = Object.fromEntries(
  helpArticles.map((a) => [a.slug, a]),
) as Record<string, HelpArticle>;
