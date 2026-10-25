import { expect, test } from "vitest";
import { isTabActive, siteTabs } from "@/lib/site-dock";

test("a visitor gets what works without an account", () => {
  expect(siteTabs("/", null).map((tab) => [tab.label, tab.href])).toEqual([
    ["Home", "/"],
    ["Browse", "/browse"],
    ["Sell", "/sell"],
    ["Sign in", "/signin"],
  ]);
});

test("signing in from a page comes back to it", () => {
  const signIn = siteTabs("/listing/petpatrolshorts-youtube", null).at(-1);
  expect(signIn?.href).toBe(
    "/signin?next=%2Flisting%2Fpetpatrolshorts-youtube",
  );
});

test("a member gets the dashboard's own bar, with its counts", () => {
  const tabs = siteTabs("/", { counts: { deals: 2, messages: 5 } });
  expect(tabs.map((tab) => [tab.label, tab.href, tab.waiting])).toEqual([
    ["Home", "/dashboard", undefined],
    ["Browse", "/browse", undefined],
    ["Deals", "/dashboard/deals", 2],
    ["Messages", "/dashboard/messages", 5],
  ]);
});

test("a member's counts are left out until they arrive", () => {
  const tabs = siteTabs("/", { counts: null });
  expect(tabs.every((tab) => tab.waiting === undefined)).toBe(true);
});

test("Home is lit on the homepage alone", () => {
  expect(isTabActive("/", "/")).toBe(true);
  expect(isTabActive("/browse", "/")).toBe(false);
  expect(isTabActive("/dashboard", "/dashboard")).toBe(true);
  expect(isTabActive("/dashboard/deals", "/dashboard")).toBe(false);
});

test("Browse is lit across the marketplace, a listing included", () => {
  for (const path of ["/browse", "/browse/youtube", "/listing/some-channel"]) {
    expect(isTabActive(path, "/browse")).toBe(true);
  }
  for (const path of ["/", "/browser", "/sell", "/seller/someone"]) {
    expect(isTabActive(path, "/browse")).toBe(false);
  }
});

test("a section's tab is lit beneath it, and a query is ignored", () => {
  expect(isTabActive("/sell", "/sell")).toBe(true);
  expect(isTabActive("/dashboard/deals/abc", "/dashboard/deals")).toBe(true);
  expect(isTabActive("/signin", "/signin?next=%2Fbrowse")).toBe(true);
});
