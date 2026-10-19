import { expect, test } from "vitest";
import { handoverTarget, parseHandoverTo } from "@/lib/handover-target";

// Before paying, the buyer says which account receives ownership. What that
// is depends on how the platform transfers: a Google account for a YouTube
// Brand Account, a username for Telegram, an email or profile for Facebook.

test("each platform asks for the thing its transfer actually needs", () => {
  expect(handoverTarget("YOUTUBE").label).toBe("Google account to make owner");
  expect(handoverTarget("TELEGRAM").label).toBe("Telegram username");
  expect(handoverTarget("FACEBOOK").label).toBe("Facebook account");
  expect(handoverTarget("INSTAGRAM").label).toBe(
    "Email to move the account to",
  );
  expect(handoverTarget("WEBSITE").label).toBe("Email for the domain transfer");
});

test("an email is trimmed and lower-cased", () => {
  expect(parseHandoverTo("YOUTUBE", "  Buyer.Name@Gmail.com ")).toEqual({
    ok: true,
    value: "buyer.name@gmail.com",
  });
});

test("an email platform refuses something that is not an email", () => {
  for (const raw of ["", "   ", "buyer", "buyer@", "@gmail.com", "a b@c.com"]) {
    expect(parseHandoverTo("YOUTUBE", raw).ok).toBe(false);
  }
  expect(parseHandoverTo("WEBSITE", "not-an-email")).toMatchObject({
    ok: false,
    error: "Enter the email address the domain transfer goes to.",
  });
});

test("a Telegram username gets its @, and must be a real username", () => {
  expect(parseHandoverTo("TELEGRAM", "job_alerts")).toEqual({
    ok: true,
    value: "@job_alerts",
  });
  expect(parseHandoverTo("TELEGRAM", "@Job_Alerts")).toEqual({
    ok: true,
    value: "@Job_Alerts",
  });
  expect(parseHandoverTo("TELEGRAM", "https://t.me/job_alerts")).toEqual({
    ok: true,
    value: "@job_alerts",
  });
  for (const raw of [
    "@abc",
    "@has space",
    "@toolong_toolong_toolong_toolong_x",
    "@bad-dash",
  ]) {
    expect(parseHandoverTo("TELEGRAM", raw).ok).toBe(false);
  }
});

test("Facebook takes an email or a link to the profile", () => {
  expect(parseHandoverTo("FACEBOOK", "Buyer@Example.com")).toEqual({
    ok: true,
    value: "buyer@example.com",
  });
  expect(
    parseHandoverTo("FACEBOOK", "https://www.facebook.com/buyer.profile"),
  ).toEqual({ ok: true, value: "https://www.facebook.com/buyer.profile" });
  expect(parseHandoverTo("FACEBOOK", "https://evil.example/buyer").ok).toBe(
    false,
  );
});

test("nothing silly long is ever stored", () => {
  expect(parseHandoverTo("YOUTUBE", `${"a".repeat(250)}@gmail.com`).ok).toBe(
    false,
  );
});
