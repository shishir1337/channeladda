export type LegalSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalDoc = {
  slug: string;
  title: string;
  summary: string;
  updated: string;
  sections: LegalSection[];
};

/**
 * Plain-language policy drafts. These set out how the product actually
 * behaves; a lawyer should review them before launch.
 */
export const legalDocs: Record<string, LegalDoc> = {
  terms: {
    slug: "terms",
    title: "Terms of service",
    summary:
      "The agreement between you and Channel Adda when you use the marketplace.",
    updated: "22 August 2026",
    sections: [
      {
        heading: "What Channel Adda is",
        paragraphs: [
          "Channel Adda is a marketplace and escrow agent. We introduce buyers and sellers of social media accounts and content websites, hold the buyer's payment while ownership is transferred, and release it once the buyer confirms the handover.",
          "We are not a party to the sale itself. The contract for the account is between the buyer and the seller. Our role is to hold the money, verify what we reasonably can, and decide disputes fairly on the record in front of us.",
        ],
      },
      {
        heading: "Your account",
        paragraphs: [
          "You must be at least 18 and legally able to enter contracts. One person, one account. You are responsible for everything done through your account and for keeping your password and two-factor codes to yourself.",
          "Sellers must complete identity verification before a first listing goes live. We may refuse or remove any listing at our discretion, and we will always give a reason.",
        ],
      },
      {
        heading: "Platform rules and your responsibility",
        paragraphs: [
          "Transferring an account is against the written terms of service of most platforms, including YouTube, Instagram and Facebook. You are responsible for deciding whether to proceed and for any consequence the platform imposes.",
          "We verify ownership before listing and supervise the handover, but we cannot control what a platform does with an account afterwards. Our refund policy sets out exactly what is and is not covered.",
        ],
      },
      {
        heading: "Fees",
        paragraphs: [
          "Buyers pay 3% on top of the listing price. Sellers pay 5% of the sale price, deducted on completion. Listing is free, and no fee is charged on a deal that does not complete.",
        ],
      },
      {
        heading: "Prohibited conduct",
        bullets: [
          "Arranging payment outside Channel Adda for a deal introduced here",
          "Listing an account you do not control, or one obtained by hacking or recovery fraud",
          "Misrepresenting audience figures, revenue, monetization status or strike history",
          "Selling accounts whose audience was bought rather than earned",
          "Attempting to recover an account after you have sold it",
          "Abusing the dispute process, or the staff who review it",
        ],
      },
      {
        heading: "Suspension and termination",
        paragraphs: [
          "We may suspend or close an account that breaks these terms. Where a suspension involves fraud, we ban by identity document rather than by email address, so the same person cannot simply sign up again.",
          "Funds held for a suspended user are frozen while any open orders or disputes are resolved, and released to whoever is entitled to them once that is settled.",
        ],
      },
      {
        heading: "Limits of our liability",
        paragraphs: [
          "Our liability on any order is limited to the amount held in escrow for that order. We are not liable for indirect losses, including lost advertising revenue, lost future earnings, or the value of an audience that declines after a sale.",
        ],
      },
    ],
  },

  privacy: {
    slug: "privacy",
    title: "Privacy policy",
    summary: "What we collect, why we collect it, and who else can see it.",
    updated: "22 August 2026",
    sections: [
      {
        heading: "What we collect",
        bullets: [
          "Account details: email address and password hash",
          "Identity documents and liveness checks, for sellers and high-value buyers",
          "Listing content: handles, metrics, screenshots and descriptions you upload",
          "Order records: messages, offers, proof uploads and transfer checklists",
          "Payment records from Cryptomus, including wallet addresses used for payouts",
          "Technical data: IP address, device and browser, used for fraud prevention",
        ],
      },
      {
        heading: "Why we collect it",
        paragraphs: [
          "To run the marketplace, to hold and release escrow correctly, to verify that sellers control what they list, to decide disputes on evidence rather than assertion, and to meet anti-money-laundering obligations.",
          "We do not sell personal data, and we do not use your data to train advertising profiles.",
        ],
      },
      {
        heading: "What other users can see",
        paragraphs: [
          "Buyers and sellers in an order can see each other's display name, rating, history and everything either of them writes or uploads to that order. They cannot see your email address, your identity documents or your wallet addresses.",
          "Until an order exists, contact details in chat are masked. This protects both sides and keeps deals inside the escrow that protects them.",
        ],
      },
      {
        heading: "How long we keep it",
        paragraphs: [
          "Order and transaction records are kept for seven years to meet financial record-keeping obligations. Identity documents are kept for five years after an account closes, as anti-money-laundering rules require. Everything else is deleted when you close your account.",
        ],
      },
      {
        heading: "Your rights",
        paragraphs: [
          "You can request a copy of your data, ask us to correct it, or ask us to delete it. Deletion requests cannot override the retention periods above where the law requires us to keep records. Write to privacy@channeladda.com.",
        ],
      },
    ],
  },

  refunds: {
    slug: "refunds",
    title: "Refund policy",
    summary:
      "When you get your money back, when you do not, and how quickly it happens.",
    updated: "22 August 2026",
    sections: [
      {
        heading: "The short version",
        paragraphs: [
          "If you do not end up with working, uncontested control of the account you paid for, you get a full refund. Escrow exists precisely so this is possible.",
        ],
      },
      {
        heading: "Always refunded in full",
        bullets: [
          "The seller never starts the transfer",
          "The seller goes silent partway through the handover",
          "The account is materially different from the listing — wrong audience size, undisclosed strikes, different niche",
          "The previous owner recovers the account during the escrow hold period",
          "The seller cannot complete the transfer for a reason within their control",
        ],
      },
      {
        heading: "Not refunded",
        bullets: [
          "Advertising revenue not continuing after the sale — this is disclosed on the listing and acknowledged at checkout, because ad accounts cannot be transferred",
          "The audience declining after you take over",
          "A change of mind after you have confirmed the handover and the hold period has ended",
          "A platform banning the account for something you did after taking ownership",
        ],
      },
      {
        heading: "Platform action after completion",
        paragraphs: [
          "If a platform suspends or bans a sold account within the escrow hold period for a reason that pre-dates the sale, that is treated as the account being materially different from the listing and is refunded in full.",
          "After the hold period ends, the account is yours and the risk sits with you. This is why the hold periods are set by each platform's own recovery and review windows rather than picked for convenience.",
        ],
      },
      {
        heading: "How refunds are paid",
        paragraphs: [
          "Crypto payments cannot be reversed, so a refund is a new outbound payment. Refunds are credited to your Channel Adda balance immediately on a decision, and you withdraw to your own wallet from there. Network fees on that withdrawal are set by the blockchain, not by us.",
          "The 3% buyer fee is refunded alongside a full refund. On a partial settlement it is adjusted to match the amount actually settled.",
        ],
      },
      {
        heading: "Timings",
        paragraphs: [
          "Disputes get a first response within 48 hours and a decision within seven days. Once decided, a refund reaches your balance the same day.",
        ],
      },
    ],
  },

  "aml-kyc": {
    slug: "aml-kyc",
    title: "AML & KYC policy",
    summary:
      "Identity checks, transaction monitoring, and why a marketplace handling crypto needs both.",
    updated: "22 August 2026",
    sections: [
      {
        heading: "Why this exists",
        paragraphs: [
          "Channel Adda holds and moves money on behalf of other people. That makes us attractive to anyone wanting to move funds they should not have, so we verify who our sellers are and monitor what moves through the platform.",
        ],
      },
      {
        heading: "Who has to verify",
        bullets: [
          "Every seller, before a first listing goes live",
          "Any buyer whose single order exceeds $2,000",
          "Any user we flag through monitoring, at any transaction size",
        ],
      },
      {
        heading: "What verification involves",
        paragraphs: [
          "A government-issued photo ID and a liveness check confirming the document belongs to the person presenting it. For business sellers we also verify the entity and its beneficial owners.",
          "We ban by document hash rather than email address. Someone removed for fraud cannot return with a new email.",
        ],
      },
      {
        heading: "Monitoring",
        bullets: [
          "Screening of payout wallet addresses against known high-risk sources",
          "Flagging of unusual patterns, such as rapid buy-and-resell of the same account",
          "Manual review of withdrawals above a threshold",
          "A hard block on withdrawals for any user with an open dispute",
        ],
      },
      {
        heading: "What we will not do",
        paragraphs: [
          "We do not process cash, we do not accept payment from a third party on a buyer's behalf, and we do not act as a general exchange. Money enters and leaves only in connection with a real marketplace transaction.",
        ],
      },
    ],
  },

  "listing-rules": {
    slug: "listing-rules",
    title: "Listing rules",
    summary:
      "What you can list, what gets rejected, and what you must disclose.",
    updated: "22 August 2026",
    sections: [
      {
        heading: "Before you list",
        paragraphs: [
          "You must control the account outright and have the right to sell it. You will be asked to place a one-time Channel Adda code in the bio or description so we can confirm this on the live account.",
        ],
      },
      {
        heading: "What you must disclose",
        bullets: [
          "Every active strike, warning or restriction",
          "Whether the account has been sold or transferred before",
          "Whether a YouTube channel is on a Brand Account or a personal Google account",
          "For websites, the registrar and whether the domain is inside a transfer lock",
          "Any paid promotion used to build the audience",
          "Where revenue figures are quoted, the source and the period they cover",
        ],
      },
      {
        heading: "We will reject",
        bullets: [
          "Accounts you do not control, or obtained through hacking or recovery fraud",
          "Accounts built primarily on other people's content without permission",
          "Audiences built with bought followers or engagement",
          "Listings using screenshots that appear on another listing",
          "Prices far outside the market band for that niche and size, without explanation",
          "Any account whose content is illegal in a major market",
        ],
      },
      {
        heading: "Revenue claims",
        paragraphs: [
          "You may quote what an account earns, with proof. You may not imply that this income transfers with the account, because it does not — advertising revenue is paid to an ad account tied to a person's tax identity and cannot be sold.",
          "Every listing quoting a revenue figure carries an automatic notice explaining this to the buyer, and the buyer acknowledges it at checkout.",
        ],
      },
      {
        heading: "If your listing is rejected",
        paragraphs: [
          "You will get a specific reason and a link straight back to editing. Most rejections are fixable in a few minutes. Repeatedly submitting listings that break these rules will suspend your ability to sell.",
        ],
      },
    ],
  },
};

export const legalSlugs = Object.keys(legalDocs);
