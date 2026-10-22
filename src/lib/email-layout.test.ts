import { afterEach, beforeEach, expect, test } from "vitest";
import { emailAction, emailHtml, emailText } from "@/lib/email-layout";

/**
 * Every email the site sends, in one layout. The owner's word on the plain
 * one: "very generic, not brand oriented" — no mark, no brand colour, and a
 * button that said "Open Channel Adda" whatever the email was about.
 */

const site = process.env.NEXT_PUBLIC_SITE_URL;
beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://channeladda.test/";
});
afterEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = site;
});

const reset = {
  subject: "Reset your Channel Adda password",
  body: "Someone asked to reset the password on this account.\n\nIf this was not you, ignore this email.",
  link: "https://channeladda.test/reset?token=abc",
  action: "Reset password",
};

test("an email carries the brand: the mark, the wordmark and the gold button", () => {
  const html = emailHtml(reset);
  expect(html).toContain('src="https://channeladda.test/email/mark.png"');
  // Decorative: the wordmark beside it is live text, so an email read with
  // images off says "Channel Adda" once, not twice.
  expect(html).toContain('alt=""');
  expect(html).toMatch(/Channel <span[^>]*color:#96590a[^>]*>Adda<\/span>/);
  expect(html).toMatch(/bgcolor="#ffb020"/);
  expect(html).toMatch(/>Reset password<\/a>/);
});

test("the subject is the heading unless an email names its own", () => {
  expect(emailHtml(reset)).toMatch(
    /<h1[^>]*>Reset your Channel Adda password<\/h1>/,
  );
  const code = emailHtml({
    subject: "123456 is your Channel Adda code",
    heading: "Confirm your email address",
    body: "Enter this code on Channel Adda.",
    code: "123456",
  });
  expect(code).toMatch(/<h1[^>]*>Confirm your email address<\/h1>/);
  expect(code).toMatch(/letter-spacing:8px[^>]*>123456</);
});

test("a link with no named action still gets a button, and no link gets none", () => {
  expect(emailHtml({ ...reset, action: undefined })).toMatch(
    />Open Channel Adda<\/a>/,
  );
  const plain = emailHtml({ subject: "Paid", body: "You have been paid." });
  expect(plain).not.toContain('bgcolor="#ffb020"');
  expect(plain).not.toContain("paste this link");
});

test("the inbox preview is the first line of news, not the greeting", () => {
  const html = emailHtml({
    subject: "Your move",
    body: "Hi Rafi,\n\nIt is your turn on Gaming channel (CA-1234).",
  });
  expect(html).toMatch(
    /<div style="display:none[^"]*">It is your turn on Gaming channel \(CA-1234\)\./,
  );
});

test("whatever a member typed is escaped, in the body, the heading and the link", () => {
  const html = emailHtml({
    subject: '<b>Offer</b> on "Cats & dogs"',
    body: "Note: <script>alert(1)</script>",
    link: 'https://channeladda.test/x?a=1&b="2"',
  });
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<b>Offer</b>");
  expect(html).toContain(
    "&lt;b&gt;Offer&lt;/b&gt; on &quot;Cats &amp; dogs&quot;",
  );
  expect(html).toContain(
    'href="https://channeladda.test/x?a=1&amp;b=&quot;2&quot;"',
  );
});

test("the footer says what we never ask for, and where help is", () => {
  const html = emailHtml(reset);
  expect(html).toMatch(/never ask for your password/);
  expect(html).toContain('href="https://channeladda.test/help"');
});

test("the plain-text copy names the action beside its link and signs off", () => {
  const text = emailText(reset);
  expect(text).toContain(
    "Reset password: https://channeladda.test/reset?token=abc",
  );
  expect(text).toMatch(/— Channel Adda\nhttps:\/\/channeladda\.test\n$/);
});

test("a notification's page names its button", () => {
  expect(emailAction("/dashboard/deals/abc")).toBe("Open the deal");
  expect(emailAction("/dashboard/messages/abc")).toBe("Open the conversation");
  expect(emailAction("/dashboard/offers")).toBe("See your offers");
  expect(emailAction("/dashboard/wallet#reseller")).toBe("Open your wallet");
  expect(emailAction("/dashboard/listings/abc")).toBe("Open your listing");
  expect(emailAction("/listing/abc")).toBe("View the listing");
  expect(emailAction("/admin/disputes")).toBe("Open in admin");
  expect(emailAction("/somewhere-else")).toBe("Open Channel Adda");
});
