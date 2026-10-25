import { describe, expect, it } from "vitest";
import { hasContactDetails } from "@/lib/contact-details";

/**
 * QA put "WhatsApp 9876543210" in a live listing's title, a phone, an email
 * and a t.me link in its description, and an email in its handover note, and
 * every one of them went in front of buyers. The bio already refused these;
 * listings now share its rule, and the rule learnt to read an email spelled
 * out to get past the @.
 */

describe("contact details", () => {
  it.each([
    "Desi Food Diaries - WhatsApp 9876543210 for a better price",
    "Skip the fees: pay me direct. WhatsApp +91 98765 43210",
    "email sana.deals@gmail.com",
    "https://t.me/sanadeals",
    "t.me/sanadeals",
    "wa.me/919876543210",
    "Contact me at sana.deals@gmail.com",
    "www.sanadeals.in",
    "sanadeals.com",
    "bit.ly/3abcd",
    "Ping me on @sanadeals",
  ])("finds the ones QA used: %s", (text) => {
    expect(hasContactDetails(text)).toBe(true);
  });

  it.each([
    "sana dot deals at gmail dot com",
    "sana.deals at gmail.com",
    "sana (at) gmail (dot) com",
    "sana [at] gmail [dot] com",
    "sana at the rate gmail",
    "write to gmail dot com",
    "WhatsApp number on request",
    "Skype id sanadeals",
    "Telegram me for the price",
  ])("finds an email or a handle spelled out: %s", (text) => {
    expect(hasContactDetails(text)).toBe(true);
  });

  it.each([
    "Owner email is a Gmail I will hand over, 2FA by SMS",
    "Home-style Indian recipes, 4 reels a week (edited).\nAudience: 78% India, 62% women aged 18-34.\nEarns from brand collabs, 2-3 per month.",
    "Sold 12 channels, 1.2M subscribers, since 2019.",
    "Telegram: 12K subscribers, 40 signals a week",
    "Crypto signal numbers posted daily, 2019-2024",
    "Grows at the rate of 2K a month.",
    "Priced at cost. In 2023 it earned $1,200,000.",
    "The Instagram handle comes with the account.",
    "Message me here with any questions.",
    "Sits on a Brand Account; the domain is at Cloudflare.",
  ])("leaves an honest listing alone: %s", (text) => {
    expect(hasContactDetails(text)).toBe(false);
  });

  it("lets a listing name its own account, and only where it stands alone", () => {
    const allow = "@desifooddiaries";
    expect(
      hasContactDetails("Follow along at @desifooddiaries", { allow }),
    ).toBe(false);
    expect(hasContactDetails("desifooddiaries: 49K followers", { allow })).toBe(
      false,
    );
    // Not as the start of an address, or behind somebody else's @.
    expect(hasContactDetails("desifooddiaries@gmail.com", { allow })).toBe(
      true,
    );
    expect(hasContactDetails("sana@desifooddiaries", { allow })).toBe(true);
    // Another account is still another account.
    expect(hasContactDetails("@sanadeals", { allow })).toBe(true);

    // A website listing's handle is its domain; a link to more than that is
    // still a link.
    const site = { allow: "desifood.com" };
    expect(hasContactDetails("desifood.com gets 40K visits", site)).toBe(false);
    expect(hasContactDetails("desifood.com/contact", site)).toBe(true);
    // And a handle that happens to be a short-link host opens no gap.
    expect(hasContactDetails("t.me/sanadeals", { allow: "t.me" })).toBe(true);
  });
});
