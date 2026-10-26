import { describe, expect, it } from "vitest";
import { googlePhotoFromIdToken, isGooglePhotoUrl } from "@/lib/google-photo";

/** An unsigned token: only the middle part is ever read here. */
function token(payload: Record<string, unknown>) {
  const part = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part(payload)}.signature`;
}

describe("googlePhotoFromIdToken", () => {
  it("takes the photo from the token, at a size worth keeping", () => {
    expect(
      googlePhotoFromIdToken(
        token({
          email: "nadia@example.com",
          picture: "https://lh3.googleusercontent.com/a/ACg8ocK=s96-c",
        }),
      ),
    ).toBe("https://lh3.googleusercontent.com/a/ACg8ocK=s256-c");
  });

  it("keeps a photo address with no size in it as it is", () => {
    expect(
      googlePhotoFromIdToken(
        token({ picture: "https://lh5.googleusercontent.com/a/ACg8ocK" }),
      ),
    ).toBe("https://lh5.googleusercontent.com/a/ACg8ocK");
  });

  it("finds nothing in a token with no photo, or in no token", () => {
    expect(googlePhotoFromIdToken(token({ email: "a@b.co" }))).toBeNull();
    expect(googlePhotoFromIdToken("not-a-token")).toBeNull();
    expect(googlePhotoFromIdToken("a.%%%.c")).toBeNull();
    expect(googlePhotoFromIdToken(null)).toBeNull();
    expect(googlePhotoFromIdToken(undefined)).toBeNull();
  });

  it("refuses a photo anywhere but Google's photo host", () => {
    for (const picture of [
      "https://example.com/me.png",
      "http://lh3.googleusercontent.com/a/x",
      "https://lh3.googleusercontent.com.evil.test/a/x",
      "https://yt3.googleusercontent.com/a/x",
      42,
    ]) {
      expect(googlePhotoFromIdToken(token({ picture })), String(picture)).toBe(
        null,
      );
    }
  });
});

describe("isGooglePhotoUrl", () => {
  it("is Google's account photo host over https only", () => {
    expect(isGooglePhotoUrl("https://lh3.googleusercontent.com/a/x")).toBe(
      true,
    );
    expect(isGooglePhotoUrl("https://lh3.googleusercontent.com:8443/a")).toBe(
      false,
    );
    expect(isGooglePhotoUrl("/uploads/avatar/abc.png")).toBe(false);
    expect(isGooglePhotoUrl("")).toBe(false);
  });
});
