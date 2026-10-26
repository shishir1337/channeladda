import { CONTACT_EMAIL } from "@/lib/seo";

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
    updated: "26 October 2026",
    sections: [
      {
        heading: "What Channel Adda is",
        paragraphs: [
          "Channel Adda is a marketplace and a supervised transfer service. We introduce buyers and sellers of social media accounts and content websites, and on every deal one side of the exchange is held by us while the other moves.",
          "On a Safest deal we hold the account. One of our agents takes ownership of it, and only once it is verifiably in our hands does the buyer pay the purchase price to the seller directly, to the payment details the seller gives on the deal. When the seller confirms the payment arrived, our agent transfers the account on to the buyer. Channel Adda takes its fee from the buyer and never holds the price.",
          "On a Fastest deal we hold the money. The buyer pays us the price and our fee together. The seller gives the account to our agent, who invites the buyer as owner; after the holding period our agent becomes primary owner and we pay the seller, and our agent then makes the buyer primary owner.",
          "We are not a party to the sale itself. The contract for the account is between the buyer and the seller. Our role is to hold the buyer's payment on a Fastest deal and the account on a Safest one, to verify what we reasonably can, and to decide disputes fairly on the record in front of us.",
        ],
      },
      {
        heading: "Your account",
        paragraphs: [
          "You must be at least 18 and legally able to enter contracts. One person, one account. You are responsible for everything done through your account and for keeping your password and two-factor codes to yourself.",
          "Verifying your identity is optional. You can buy, sell and withdraw without it. If you want the Verified badge beside your name, you can send us a government ID and a short selfie video, and our team checks them by hand.",
          "We may refuse or remove any listing at our discretion, and we will always give a reason.",
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
          "Buyers pay a percentage on top of the listing price, set by us and shown in full on the listing page and at /fees before you commit. A seller fee may apply on either kind of deal; it is deducted from the sale price on completion and is currently zero. Listing is free, and no seller fee is charged on a deal that does not complete; when the buyer fee is returned is set out in our refund policy. The rates in force are always the ones shown at /fees.",
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
          "We may suspend or close an account that breaks these terms. Where a suspension involves fraud and the account was verified, we keep a fingerprint of the ID, and our team is told if the same document turns up on another account.",
          "Funds held for a suspended user are frozen while any open orders or disputes are resolved, and released to whoever is entitled to them once that is settled.",
        ],
      },
      {
        heading: "Limits of our liability",
        paragraphs: [
          "Our liability on any order is limited to what we are holding for that order: the money paid to us for it, and on a Safest deal the account in our custody as well. We cannot return money that was paid to a seller outside Channel Adda. We are not liable for indirect losses, including lost advertising revenue, lost future earnings, or the value of an audience that declines after a sale.",
        ],
      },
    ],
  },

  privacy: {
    slug: "privacy",
    title: "Privacy policy",
    summary: "What we collect, why we collect it, and who else can see it.",
    updated: "27 October 2026",
    sections: [
      {
        heading: "What we collect",
        bullets: [
          "Account details: email address and password hash",
          "Identity documents and a short selfie video, only if you choose to get the Verified badge",
          "Listing content: handles, metrics, screenshots and descriptions you upload",
          "Order records: messages, offers, proof uploads and transfer checklists",
          "Payment records from Cryptomus, including wallet addresses used for payouts",
          "Technical data: IP address, device and browser, used for fraud prevention",
        ],
      },
      {
        heading: "Why we collect it",
        paragraphs: [
          "To run the marketplace, to hold and release accounts and payments correctly, to verify that sellers control what they list, to decide disputes on evidence rather than assertion, and to meet anti-money-laundering obligations.",
          "We do not sell personal data, and we do not use your data to train advertising profiles.",
        ],
      },
      {
        heading: "What other users can see",
        paragraphs: [
          "Buyers and sellers in an order can see each other's display name, rating, history and everything either of them writes or uploads to that order. They cannot see your email address, your identity documents or your wallet addresses.",
          "If you send an ID and a selfie video for the Verified badge, only our verification team sees them. They are never shown on your profile. Other people see only the badge.",
          "Until an order exists, contact details in chat are masked. This protects both sides and keeps deals inside the supervision that protects them.",
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
          `You can request a copy of your data, ask us to correct it, or ask us to delete it. Deletion requests cannot override the retention periods above where the law requires us to keep records. Write to ${CONTACT_EMAIL}.`,
        ],
      },
    ],
  },

  refunds: {
    slug: "refunds",
    title: "Refund policy",
    summary:
      "When you get your money back, when you do not, and how quickly it happens.",
    updated: "26 October 2026",
    sections: [
      {
        heading: "The short version",
        paragraphs: [
          "What you get back depends on which of the two deal types you chose, because they protect you in opposite ways. Read the section for yours.",
        ],
      },
      {
        heading: "A Fastest deal",
        paragraphs: [
          "We hold the whole amount — the account's price and our fee — from the moment you pay until our agent is the account's primary owner, which is when the seller is paid. If the account never reaches our agent, we return all of it. From then on it is in our hands, and our agent transfers it to you.",
        ],
        bullets: [
          "The seller never starts the transfer",
          "The seller goes silent partway through the handover",
          "The account is materially different from the listing — wrong audience size, undisclosed strikes, different niche",
          "The seller removes you, or takes the account back, during the holding period",
          "The seller cannot complete the transfer for a reason within their control",
        ],
      },
      {
        heading: "A Safest deal",
        paragraphs: [
          "You pay us our fee, and nothing else. Once one of our agents has taken ownership of the account, you pay the seller the account's price directly, to the payment details they give on the deal, and press Paid; the seller presses Received when it arrives. Only then does our agent transfer the account to you.",
          "What protects you is the order of events and the fact that we hold the account. Before you pay the seller, the account is already out of their hands and in ours — they cannot take it back, sell it twice, or disappear with it — and it moves to you once they confirm your payment.",
          "If a deal fails before our agent has taken custody, we refund our fee in full. If it fails after that, we return the account to the seller; the fee has paid for the agent's work and is kept. We never hold the price, so we cannot refund it. If the seller will not confirm a payment you made, we decide on the record — when you pressed Paid, and the proof you put in the chat — and if it shows you paid, our agent transfers the account to you. Once the seller has confirmed the payment, the account cannot go back to them.",
        ],
      },
      {
        heading: "Not refunded",
        bullets: [
          "Advertising revenue not continuing after the sale — this is disclosed on the listing and acknowledged at checkout, because ad accounts cannot be transferred",
          "The audience declining after you take over",
          "A change of mind after the account has been transferred to you",
          "Money paid to a seller on a Fastest deal, or on a Safest deal before our agent holds the account or to details other than the ones the seller gave on the deal — we never held it, and no part of this policy can bring it back",
          "A platform banning the account for something you did after taking ownership",
        ],
      },
      {
        heading: "Platform action after completion",
        paragraphs: [
          "If a platform suspends or bans a sold account before the deal completes, for a reason that pre-dates the sale, that is treated as the account being materially different from the listing — but raise it before the deal completes. Once a deal is closed it cannot be reopened, on either side, which is why you should check the account properly while the deal runs — on a Fastest deal you are an owner through the whole holding period. On a Fastest deal raised before our agent holds the account you are refunded in full. On a Safest deal raised in time, if our agent still holds the account and the seller has not confirmed a payment, it goes back to the seller; the fee is returned only if our agent had not yet taken custody.",
          "After the deal completes, the account is yours and the risk sits with you. This is why a Fastest deal's holding period is set by each platform's own review windows rather than picked for convenience.",
        ],
      },
      {
        heading: "How refunds are paid",
        paragraphs: [
          "Crypto payments cannot be reversed, so a refund is a new outbound payment. Refunds are credited to your Channel Adda balance immediately on a decision, and you withdraw to your own wallet from there. Network fees on that withdrawal are set by the blockchain, not by us.",
          "The buyer fee is returned with a full refund, and on a Safest deal it is returned on its own if the deal dies before our agent takes custody of the account. Once an agent has held the account, the fee has bought the work that was done and is not returned.",
        ],
      },
      {
        heading: "Timings",
        paragraphs: [
          "Disputes get a first response within 24 hours and a decision within seven days. Once decided, a refund reaches your balance the same day.",
        ],
      },
    ],
  },

  "aml-kyc": {
    slug: "aml-kyc",
    title: "AML & KYC policy",
    summary:
      "Optional ID checks for the Verified badge, and how we watch for misuse.",
    updated: "26 October 2026",
    sections: [
      {
        heading: "Why this exists",
        paragraphs: [
          "Channel Adda holds and moves money on behalf of other people. That makes us attractive to anyone wanting to move funds they should not have, so we watch what moves through the platform, and members can verify who they are.",
        ],
      },
      {
        heading: "Who verifies",
        paragraphs: [
          "Verifying is optional. Nobody has to verify to buy, sell or withdraw. Members who want the Verified badge beside their name can choose to.",
        ],
      },
      {
        heading: "What verification involves",
        paragraphs: [
          'A photo of a government ID: an Aadhaar card, a PAN card, a passport, or another government ID such as a driving licence or voter ID. Then a short selfie video, holding the same ID and saying your name and "Channel Adda".',
          "Our team checks them by hand, usually within 24 hours. Only our verification team sees them, and they are never shown on your profile. If we cannot verify you, we say why, and you can try again.",
          "We keep a fingerprint of each approved document. If the same document turns up on another account, our team is told.",
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
