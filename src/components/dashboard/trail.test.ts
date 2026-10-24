import { describe, expect, it } from "vitest";
import { trailFor } from "@/components/dashboard/app-shell";

// The owner: "navigating pages and breadcrumbs should be easy". Every step
// above the page is a link back to it.

const home = { href: "/dashboard", label: "Home" };
const deals = { href: "/dashboard/deals", label: "Deals" };

describe("trailFor", () => {
  it("is just the page on Home", () => {
    expect(trailFor("/dashboard", home, home, "Home")).toEqual([
      { label: "Home" },
    ]);
  });

  it("links back to Home from a section", () => {
    expect(trailFor("/dashboard/deals", home, deals, "Deals")).toEqual([
      { label: "Home", href: "/dashboard" },
      { label: "Deals" },
    ]);
  });

  it("links back to the section from a page inside it", () => {
    expect(trailFor("/dashboard/deals/abc", home, deals, "Deals")).toEqual([
      { label: "Home", href: "/dashboard" },
      { label: "Deals", href: "/dashboard/deals" },
      { label: "Deal" },
    ]);
  });

  it("calls an unknown page inside a section its details", () => {
    const wallet = { href: "/dashboard/wallet", label: "Wallet" };
    expect(
      trailFor("/dashboard/wallet/x", home, wallet, "Wallet").at(-1),
    ).toEqual({ label: "Details" });
  });
});
