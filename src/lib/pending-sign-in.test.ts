import { describe, expect, it } from "vitest";
import { hasPendingTwoFactor } from "@/lib/pending-sign-in";

const jar = (...names: string[]) => ({
  has: (name: string) => names.includes(name),
});

describe("hasPendingTwoFactor", () => {
  it("is true while the password step's cookie is there, on http and https", () => {
    expect(hasPendingTwoFactor(jar("channeladda.two_factor"))).toBe(true);
    expect(hasPendingTwoFactor(jar("__Secure-channeladda.two_factor"))).toBe(
      true,
    );
  });

  it("is false with no sign-in in progress, signed in or not", () => {
    expect(hasPendingTwoFactor(jar())).toBe(false);
    expect(hasPendingTwoFactor(jar("channeladda.session_token"))).toBe(false);
    // Another site's cookie of the same plugin is not ours.
    expect(hasPendingTwoFactor(jar("better-auth.two_factor"))).toBe(false);
  });
});
