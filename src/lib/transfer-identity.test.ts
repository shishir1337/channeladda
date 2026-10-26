import { describe, expect, test } from "vitest";
import {
  emailsIn,
  identityFor,
  identityName,
  missingIdentity,
  parseFacebook,
  parseTelegram,
  parseTransferIds,
} from "@/lib/transfer-identity";

// QA, CA-87042: a Telegram seller was told "Make this account an admin:
// transfers@channeladda.test". A Telegram admin is a username.

describe("each platform hands over to its own kind of account", () => {
  const ids = {
    email: "transfers@channeladda.test",
    telegram: "@ca_transfers",
    facebook: "https://www.facebook.com/ca.transfers",
  };

  test("YouTube, Instagram and websites use the email", () => {
    for (const platform of ["YOUTUBE", "INSTAGRAM", "WEBSITE"] as const) {
      expect(identityFor(platform, ids)).toBe("transfers@channeladda.test");
    }
  });

  test("Telegram uses the username, Facebook the Facebook account", () => {
    expect(identityFor("TELEGRAM", ids)).toBe("@ca_transfers");
    expect(identityFor("FACEBOOK", ids)).toBe(
      "https://www.facebook.com/ca.transfers",
    );
  });

  test("an agent with only an email has nothing for a Telegram deal", () => {
    const emailOnly = { ...ids, telegram: null, facebook: null };
    expect(identityFor("TELEGRAM", emailOnly)).toBeNull();
    expect(identityFor("FACEBOOK", emailOnly)).toBeNull();
    expect(identityFor("TELEGRAM", null)).toBeNull();
  });

  test("names it in the platform's words", () => {
    expect(identityName("TELEGRAM")).toBe("Telegram username");
    expect(identityName("YOUTUBE")).toBe("Google account");
  });

  test("says what is missing and where to set it", () => {
    expect(missingIdentity("TELEGRAM", { self: true })).toMatch(
      /Telegram username.*Security page/,
    );
    expect(
      missingIdentity("FACEBOOK", { self: false, name: "Imran Hossain" }),
    ).toMatch(
      /^Imran Hossain's transfer identity has no Facebook account.*Team page/,
    );
  });
});

describe("a Telegram username is checked as Telegram checks it", () => {
  test("@name, name and a t.me link are all kept as @name", () => {
    expect(parseTelegram("@ca_transfers")).toEqual({
      ok: true,
      value: "@ca_transfers",
    });
    expect(parseTelegram("ca_transfers")).toEqual({
      ok: true,
      value: "@ca_transfers",
    });
    expect(parseTelegram("https://t.me/ca_transfers")).toEqual({
      ok: true,
      value: "@ca_transfers",
    });
  });

  test("5 to 32 characters, letters, numbers and underscores", () => {
    expect(parseTelegram("@abcd").ok).toBe(false);
    expect(parseTelegram("@abcde").ok).toBe(true);
    expect(parseTelegram(`@a${"b".repeat(31)}`).ok).toBe(true);
    expect(parseTelegram(`@a${"b".repeat(32)}`).ok).toBe(false);
    expect(parseTelegram("@ca-transfers").ok).toBe(false);
    expect(parseTelegram("@1transfers").ok).toBe(false);
    expect(parseTelegram("transfers@channeladda.test").ok).toBe(false);
  });

  test("blank is unset", () => {
    expect(parseTelegram("  ")).toEqual({ ok: true, value: null });
  });
});

describe("a Facebook account is an email or a profile link", () => {
  test("a profile link is kept as a full link", () => {
    expect(parseFacebook("facebook.com/ca.transfers")).toEqual({
      ok: true,
      value: "https://www.facebook.com/ca.transfers",
    });
    expect(parseFacebook("https://m.facebook.com/ca.transfers/")).toEqual({
      ok: true,
      value: "https://www.facebook.com/ca.transfers",
    });
  });

  test("an email is lower-cased", () => {
    expect(parseFacebook("Pages@ChannelAdda.test")).toEqual({
      ok: true,
      value: "pages@channeladda.test",
    });
  });

  test("a bare name is refused: it finds the wrong person", () => {
    expect(parseFacebook("Channel Adda Transfers").ok).toBe(false);
  });
});

describe("the identity form", () => {
  test("needs at least one account", () => {
    expect(
      parseTransferIds({ email: "", telegram: "", facebook: "" }),
    ).toMatchObject({ ok: false });
  });

  test("says which field is wrong", () => {
    expect(
      parseTransferIds({ email: "a@b.test", telegram: "@no" }),
    ).toMatchObject({ ok: false, field: "telegram" });
  });

  test("the emails among them are what is checked against sign-ins", () => {
    const parsed = parseTransferIds({
      email: "Desk@ChannelAdda.test",
      telegram: "@ca_transfers",
      facebook: "fb@channeladda.test",
    });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(emailsIn(parsed.value)).toEqual([
      "desk@channeladda.test",
      "fb@channeladda.test",
    ]);
  });
});
