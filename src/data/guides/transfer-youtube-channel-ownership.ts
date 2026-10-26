import type { Guide } from "./types";

export const transferYoutubeChannelOwnership: Guide = {
  slug: "transfer-youtube-channel-ownership",
  title: "How to transfer YouTube channel ownership",
  metaTitle: "How to transfer YouTube channel ownership",
  description:
    "Transfer a YouTube channel with Google's Brand Account tools: add an owner, wait 7 days, make them primary owner. Why personal-account channels cannot move.",
  updated: "26 October 2026",
  keyword: "how to transfer youtube channel ownership",
  intro: [
    "To transfer ownership of a YouTube channel, the channel must sit on a Brand Account. The primary owner adds the new person's Google account as an owner, Google makes the new owner wait 7 days, and then the primary owner makes them primary owner so they can remove everyone else.",
    "A channel on a personal Google account cannot be moved this way. This guide shows how to tell which kind you have, each step in order, what happens during the 7-day wait and what does not move with the channel. At the end it shows how a sale on Channel Adda uses the same steps with our agent in the middle.",
  ],
  sections: [
    {
      heading: "Brand Account or personal account: check this first",
      blocks: [
        {
          kind: "p",
          text: "A Brand Account is a Google account made for a channel or a business. It can have several owners and managers, and none of them need to share a password. A personal Google account belongs to one person and also holds their Gmail, Drive and other services.",
        },
        {
          kind: "p",
          text: "To check, sign in with the Google account that runs the channel and open the Brand Accounts page in your Google account settings. If the channel is listed there, it sits on a Brand Account and its ownership can be transferred. If it is not listed, it is most likely tied to your personal account.",
        },
        {
          kind: "p",
          text: "A personal-account channel cannot be given to someone else without handing over the whole Google account. Do not do that, whether you are buying or selling. The old owner can often recover the account with an old phone number or recovery email, and the seller gives away their email and everything else with it. YouTube has a setting that lets the owner move a channel to a Brand Account. If you plan to sell, do that first, using YouTube's own help page for the current steps.",
        },
      ],
    },
    {
      heading: "Owner, manager and primary owner: what each role can do",
      blocks: [
        {
          kind: "p",
          text: "A Brand Account has three main roles. The names matter, because a transfer is only finished when the new person holds the top one.",
        },
        {
          kind: "list",
          items: [
            "Primary owner: there is only one. The other owners cannot remove the primary owner, and only the primary owner can make someone else primary owner.",
            "Owner: can manage the channel and add or remove managers.",
            "Manager: can use the channel, for example to upload videos, but cannot decide who owns it.",
          ],
        },
        {
          kind: "p",
          text: "YouTube Studio may also offer roles such as Editor or Viewer. These let someone help run the channel. They do not give ownership of the Brand Account, so they are not part of a transfer. Google describes these roles a little differently from time to time, so read the permissions page itself before you start.",
        },
      ],
    },
    {
      heading: "How to transfer YouTube channel ownership, step by step",
      blocks: [
        {
          kind: "p",
          text: "These steps use Google's own Brand Account settings. Nobody shares a password at any point.",
        },
        {
          kind: "list",
          ordered: true,
          items: [
            "The primary owner signs in, opens the Brand Account in their Google account settings, and goes to the page for managing permissions.",
            "They invite the new person's Google account by email and choose the role Owner.",
            "The new person accepts the invitation from the email Google sends.",
            "Both wait 7 days. Google lets someone become primary owner only after they have been an owner for 7 days.",
            "The primary owner opens the same page and makes the new person primary owner.",
            "The new primary owner removes the old owner and any managers they do not know.",
            "The new owner checks the recovery email, recovery phone and two-factor authentication on their own Google account.",
          ],
        },
        {
          kind: "p",
          text: "Make sure the invitation is for Owner, not Manager. The 7 days only count from the day someone becomes an owner, so a buyer added as a manager has not even started the wait.",
        },
      ],
    },
    {
      heading: "Why Google makes you wait 7 days",
      blocks: [
        {
          kind: "p",
          text: "Google will not let a new owner become primary owner until they have been an owner for 7 days. Nobody can shorten this: not the seller, not the buyer and not a marketplace. It is a safety rule. If a stranger adds themselves to a hacked account, the real owner has a week to notice and remove them.",
        },
        {
          kind: "p",
          text: "In a sale the wait is also the riskiest part. For those 7 days the seller is still primary owner and could remove the buyer at any time. A buyer who has already paid the seller has no protection at all. This is why the money or the channel should be held by someone else until the wait is over.",
        },
        {
          kind: "p",
          text: "Plan for it. A direct transfer takes at least 7 days from the day the invitation is accepted. If an agent in the middle takes the channel first and then passes it on, the wait can run twice.",
        },
      ],
    },
    {
      heading: "What moves with the channel, and what does not",
      blocks: [
        {
          kind: "p",
          text: "A transfer changes who owns the channel. The channel itself stays the same.",
        },
        {
          kind: "list",
          items: [
            "Moves: the videos, subscribers, playlists, comments, the channel name and handle, and its analytics history.",
            "Stays with the channel: its past, including strikes, warnings and copyright claims.",
            "Does not move: the seller's AdSense account and the money in it. The new owner links their own AdSense account.",
            "Does not move: the seller's personal Google account, Gmail and any other services in their own name.",
          ],
        },
        {
          kind: "p",
          text: "Monetization needs care. Linking a new AdSense account is a separate process with its own timeline, and YouTube can review the channel as part of it. Read [why revenue does not transfer](/help/why-revenue-does-not-transfer) before you agree a price based on earnings.",
        },
      ],
    },
    {
      heading: "How Channel Adda transfers a YouTube channel",
      blocks: [
        {
          kind: "p",
          text: "On Channel Adda the seller never hands the channel straight to the buyer. Our agent sits in the middle and does the transfer, using the same Google steps:",
        },
        {
          kind: "list",
          ordered: true,
          items: [
            "The seller invites our agent's Google account as an owner.",
            "Google's 7-day waiting period passes.",
            "The seller makes our agent primary owner of the Brand Account.",
            "Our agent invites the buyer's Google account as an owner, and Google makes the buyer wait 7 days too.",
            "Our agent makes the buyer primary owner and removes the seller.",
            "The buyer changes the recovery email and phone, then turns on two-factor authentication.",
          ],
        },
        {
          kind: "p",
          text: "Before any of this, the seller proves control of the channel by placing a one-time code in its description, and our system reads the live channel to check it. The buyer then chooses one of two deal types. On a Fastest deal the buyer pays us up front, and the seller is paid after the 7-day hold. On a Safest deal our agent holds the channel first and the buyer then pays the seller directly, so Google's wait runs again for the buyer. Both are explained on [how it works](/how-it-works).",
        },
        {
          kind: "p",
          text: "Selling? Start on our [sell page](/sell/youtube) and read [how to sell a YouTube channel](/guides/how-to-sell-a-youtube-channel). Buying? Use the [handover checklist](/help/confirming-a-handover) as soon as the channel is yours.",
        },
      ],
    },
    {
      heading: "Mistakes that break a YouTube channel transfer",
      blocks: [
        {
          kind: "p",
          text: "Most failed transfers come from a step that was skipped. Watch for these:",
        },
        {
          kind: "list",
          items: [
            "The buyer is invited as a manager instead of an owner.",
            "The seller never makes the buyer primary owner, so the buyer stays an ordinary owner.",
            "The old owner is not removed after the transfer.",
            "The recovery email or phone on the account still belongs to the seller.",
            "The channel was on a personal account, and the seller handed over a login instead.",
            "The buyer paid the seller before the 7-day wait was over, with nobody in the middle.",
          ],
        },
        {
          kind: "p",
          text: "Each of these leaves the old owner a way back in. At the end, open the permissions page and check it: the new owner should be primary owner, and nobody they do not know should be listed.",
        },
      ],
    },
  ],
  faqs: [
    {
      question:
        "Can I move a YouTube channel to another Google account of my own?",
      answer:
        "Yes. Add your other Google account as an owner of the Brand Account, wait 7 days, then make it primary owner. If the channel is on a personal account, move it to a Brand Account first using YouTube's settings.",
    },
    {
      question: "Can the 7-day wait be skipped?",
      answer:
        "No. It is Google's rule, and no seller, buyer or marketplace can shorten it. Plan the deal around it, and keep the money or the channel with someone in the middle until it is over.",
    },
    {
      question:
        "Will the channel lose its subscribers or videos when ownership changes?",
      answer:
        "No. The videos, subscribers and the channel's address stay the same, because only the owner changes. What does not carry over is the seller's AdSense account, so earnings stop until you link your own.",
    },
    {
      question: "Do I need the seller's password to take over a channel?",
      answer:
        "No. A Brand Account transfer works through invitations, so nobody shares a password. If a seller offers you a login instead, the channel is probably on a personal account and they may be able to take it back. Channel Adda staff will never ask for your password either.",
    },
    {
      question: "What if the seller removes me during the 7 days?",
      answer:
        "On a direct deal with nobody in the middle, you have no protection, which is why you should not pay first. On a Channel Adda Fastest deal your payment is still with us during the hold, so you open a dispute and a moderator decides on the record. On a Safest deal our agent is already primary owner before you pay the seller, so the seller no longer has the final say.",
    },
  ],
  links: [
    {
      label: "How to buy a YouTube channel",
      href: "/guides/how-to-buy-a-youtube-channel",
    },
    {
      label: "How to sell a YouTube channel",
      href: "/guides/how-to-sell-a-youtube-channel",
    },
    {
      label: "Is it safe to buy a YouTube channel?",
      href: "/guides/is-it-safe-to-buy-a-youtube-channel",
    },
    {
      label: "Checking a handover safely",
      href: "/help/confirming-a-handover",
    },
    { label: "Sell your YouTube channel", href: "/sell/youtube" },
    { label: "Browse YouTube channels for sale", href: "/browse/youtube" },
  ],
};
