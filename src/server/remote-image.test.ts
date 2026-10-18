import { afterEach, expect, test, vi } from "vitest";
import { db } from "@/lib/db";
import { isAllowedRemoteImage, storeRemoteImage } from "@/server/remote-image";
import { deleteUpload } from "@/server/storage";
import { seedUser, withCleanDb } from "@/test/db";

/** The smallest real PNG: a 1×1 transparent pixel. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

function answer(body: BodyInit, headers: Record<string, string> = {}) {
  return vi.fn(async () => new Response(body, { status: 200, headers }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("only the platforms' own image hosts are ever fetched", () => {
  expect(
    isAllowedRemoteImage("https://yt3.googleusercontent.com/abc=s512"),
  ).toBe(true);
  expect(isAllowedRemoteImage("https://yt3.ggpht.com/abc=s512")).toBe(true);
  expect(isAllowedRemoteImage("https://cdn4.telesco.pe/file/abc.jpg")).toBe(
    true,
  );

  expect(isAllowedRemoteImage("http://yt3.googleusercontent.com/abc")).toBe(
    false,
  );
  expect(
    isAllowedRemoteImage("https://yt3.googleusercontent.com.evil.test/abc"),
  ).toBe(false);
  expect(isAllowedRemoteImage("https://yt3.googleusercontent.com:8443/a")).toBe(
    false,
  );
  expect(isAllowedRemoteImage("https://127.0.0.1/abc.png")).toBe(false);
  expect(isAllowedRemoteImage("not a url")).toBe(false);
});

test("a host that is not allowed is refused without a request being made", async () => {
  const fetch = answer(PNG);
  vi.stubGlobal("fetch", fetch);

  expect(
    await storeRemoteImage("https://example.com/a.png", "avatar", "nobody"),
  ).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

test(
  "a channel picture is stored as the seller's own upload",
  withCleanDb(async () => {
    const seller = await seedUser();
    vi.stubGlobal("fetch", answer(PNG, { "content-type": "image/png" }));

    const url = await storeRemoteImage(
      "https://yt3.googleusercontent.com/abc=s512",
      "avatar",
      seller.id,
    );

    expect(url).toMatch(/^\/uploads\/avatar\/[0-9a-f]{32}\.png$/);
    const key = (url ?? "").replace("/uploads/", "");
    const row = await db.upload.findUnique({ where: { key } });
    // Recorded against the seller and not yet attached, so the sweep
    // collects it if the listing never uses it.
    expect(row).toMatchObject({
      uploaderId: seller.id,
      kind: "avatar",
      attachedAt: null,
    });
    await deleteUpload(key);
  }),
);

test("a response that is not an image is not stored", async () => {
  vi.stubGlobal(
    "fetch",
    answer("<html>Sign in</html>", { "content-type": "image/png" }),
  );
  expect(
    await storeRemoteImage(
      "https://yt3.googleusercontent.com/abc",
      "cover",
      "nobody",
    ),
  ).toBeNull();
});

test("a file declared larger than an upload may be is not downloaded", async () => {
  const body = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-length": String(50 * 1024 * 1024) }),
      arrayBuffer: body,
    })),
  );
  expect(
    await storeRemoteImage(
      "https://yt3.googleusercontent.com/abc",
      "cover",
      "nobody",
    ),
  ).toBeNull();
  expect(body).not.toHaveBeenCalled();
});
