import { randomBytes } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { db } from "@/lib/db";
import { adoptGooglePhoto } from "@/server/google-photo";
import { deleteUpload } from "@/server/storage";
import { seedUser, withCleanDb } from "@/test/db";

// The owner signed in with Google and the profile had no photo: an account
// that already existed is joined to Google without taking its picture, and a
// new one pointed at Google's copy, which the profile form then refused.

/** The smallest real PNG: a 1×1 transparent pixel. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const GOOGLE_PHOTO = "https://lh3.googleusercontent.com/a/ACg8ocK=s96-c";

function idToken(picture = GOOGLE_PHOTO) {
  const part = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part({ picture })}.signature`;
}

function photoAnswer() {
  return vi.fn(
    async (_url: string | URL | Request) =>
      new Response(PNG, {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function imageOf(userId: string) {
  return (
    await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { image: true },
    })
  ).image;
}

async function cleanUp(url: string | null) {
  if (url?.startsWith("/uploads/")) {
    await deleteUpload(url.replace("/uploads/", ""));
  }
}

test(
  "an account with no photo gets its own copy of the Google photo",
  withCleanDb(async () => {
    const member = await seedUser();
    const fetch = photoAnswer();
    vi.stubGlobal("fetch", fetch);

    await adoptGooglePhoto(member.id, idToken());

    const image = await imageOf(member.id);
    expect(image).toMatch(/^\/uploads\/avatar\/[0-9a-f]{32}\.png$/);
    // The bigger copy, fetched once.
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      "https://lh3.googleusercontent.com/a/ACg8ocK=s256-c",
    );
    // Marked in use, so the sweep of unused uploads leaves it.
    const upload = await db.upload.findUniqueOrThrow({
      where: { key: (image ?? "").replace("/uploads/", "") },
    });
    expect(upload).toMatchObject({ uploaderId: member.id, kind: "avatar" });
    expect(upload.attachedAt).not.toBeNull();
    await cleanUp(image);
  }),
);

test(
  "a new account pointing at Google's copy gets a copy of its own",
  withCleanDb(async () => {
    const member = await seedUser();
    await db.user.update({
      where: { id: member.id },
      data: { image: GOOGLE_PHOTO },
    });
    vi.stubGlobal("fetch", photoAnswer());

    await adoptGooglePhoto(member.id, idToken());

    const image = await imageOf(member.id);
    expect(image).toMatch(/^\/uploads\/avatar\//);
    await cleanUp(image);
  }),
);

test(
  "a photo the member chose is never replaced",
  withCleanDb(async () => {
    const member = await seedUser();
    const own = `/uploads/avatar/${randomBytes(16).toString("hex")}.png`;
    await db.user.update({ where: { id: member.id }, data: { image: own } });
    const fetch = photoAnswer();
    vi.stubGlobal("fetch", fetch);

    await adoptGooglePhoto(member.id, idToken());

    expect(await imageOf(member.id)).toBe(own);
    expect(fetch).not.toHaveBeenCalled();
  }),
);

test(
  "when Google's photo cannot be fetched the profile is left as it was",
  withCleanDb(async () => {
    const member = await seedUser();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("gone", { status: 404 })),
    );

    await adoptGooglePhoto(member.id, idToken());
    expect(await imageOf(member.id)).toBeNull();

    // No token, or one with no photo: nothing is fetched at all.
    const fetch = photoAnswer();
    vi.stubGlobal("fetch", fetch);
    await adoptGooglePhoto(member.id, null);
    await adoptGooglePhoto(member.id, "not-a-token");
    expect(fetch).not.toHaveBeenCalled();
    expect(await imageOf(member.id)).toBeNull();
  }),
);
