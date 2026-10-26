import { beforeEach, describe, expect, test, vi } from "vitest";

// The route on its own: who is asking, whether they may read the file and
// the bytes on disk are all stood in for, so what is under test is the
// headers it answers with.
const fake = vi.hoisted(() => ({
  allowed: true,
  imagekit: false,
  local: true,
  upstream: null as null | (() => Response),
  fetched: [] as { key: string; range: string | null }[],
}));
vi.mock("@/server/session", () => ({ getCurrentUser: async () => null }));
vi.mock("@/server/upload-access", () => ({
  canReadUpload: async () => fake.allowed,
}));
vi.mock("@/server/storage", () => ({
  UploadError: class UploadError extends Error {},
  hasLocalCopy: async () => fake.local,
  readUpload: async () => ({
    bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]),
    contentType: "image/png",
  }),
}));
vi.mock("@/server/imagekit", () => ({
  onImageKit: () => fake.imagekit,
  fetchFromImageKit: async (key: string, range: string | null) => {
    fake.fetched.push({ key, range });
    return fake.upstream?.() ?? null;
  },
}));

const hex = "a".repeat(32);

async function get(key: string, headers?: HeadersInit) {
  const { GET } = await import("@/app/uploads/[...path]/route");
  return GET(new Request(`http://localhost/uploads/${key}`, { headers }), {
    params: Promise.resolve({ path: key.split("/") }),
  } as Parameters<typeof GET>[1]);
}

beforeEach(() => {
  fake.allowed = true;
  fake.imagekit = false;
  fake.local = true;
  fake.upstream = null;
  fake.fetched = [];
  vi.unstubAllEnvs();
});

test("listing artwork may be kept by any cache for a year", async () => {
  for (const kind of ["cover", "avatar"]) {
    const response = await get(`${kind}/${hex}.png`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    // The same bytes for everybody, so nothing to vary on.
    expect(response.headers.get("vary")).toBeNull();
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'none'; sandbox",
    );
  }
});

test("a proof or a chat file stays private to the browser that may see it", async () => {
  for (const kind of ["proof", "message"]) {
    const response = await get(`${kind}/${hex}.png`);
    expect(response.headers.get("cache-control")).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(response.headers.get("vary")).toBe("Cookie");
  }
});

test("an ID check's photo is never written to a cache at all", async () => {
  const response = await get(`kyc/${hex}.png`);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
});

test("a file somebody may not read is a 404 with no caching promise", async () => {
  fake.allowed = false;
  const response = await get(`proof/${hex}.png`);
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBeNull();
});

describe("with uploads on ImageKit", () => {
  beforeEach(() => {
    fake.imagekit = true;
    fake.local = false;
    vi.stubEnv(
      "NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT",
      "https://ik.imagekit.io/channeladda",
    );
    vi.stubEnv("NEXT_PUBLIC_IMAGEKIT_FOLDER", "");
  });

  test("a cover or a photo is sent to ImageKit's CDN", async () => {
    for (const kind of ["cover", "avatar"]) {
      const response = await get(`${kind}/${hex}.png`);
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        `https://ik.imagekit.io/channeladda/uploads/${kind}/${hex}.png`,
      );
    }
    expect(fake.fetched).toEqual([]);
  });

  test("a private file is fetched for the reader and passed on as ours", async () => {
    fake.upstream = () =>
      new Response("abc", {
        status: 206,
        headers: { "content-range": "bytes 0-2/10", "content-length": "3" },
      });
    const response = await get(`message/${hex}.mp4`, { range: "bytes=0-2" });

    expect(fake.fetched).toEqual([
      { key: `message/${hex}.mp4`, range: "bytes=0-2" },
    ]);
    expect(response.status).toBe(206);
    expect(await response.text()).toBe("abc");
    expect(response.headers.get("content-range")).toBe("bytes 0-2/10");
    // The type decided when the file was stored, not whatever came back.
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'none'; sandbox",
    );
    expect(response.headers.get("cache-control")).toBe(
      "private, max-age=31536000, immutable",
    );
  });

  test("an ID check's photo from ImageKit is never cached either", async () => {
    fake.upstream = () => new Response("x");
    const response = await get(`kyc/${hex}.jpg`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  test("a range ImageKit ignored is cut here, so Safari can play the clip", async () => {
    fake.upstream = () => new Response("0123456789");
    const response = await get(`kyc/${hex}.mp4`, { range: "bytes=2-4" });
    expect(response.status).toBe(206);
    expect(await response.text()).toBe("234");
    expect(response.headers.get("content-range")).toBe("bytes 2-4/10");
  });

  test("a private file somebody may not read never reaches ImageKit", async () => {
    fake.allowed = false;
    const response = await get(`proof/${hex}.png`);
    expect(response.status).toBe(404);
    expect(fake.fetched).toEqual([]);
  });

  test("a file ImageKit does not have is a 404", async () => {
    const response = await get(`proof/${hex}.png`);
    expect(response.status).toBe(404);
  });

  test("a file still on the server's disk is served from there", async () => {
    fake.local = true;
    const response = await get(`proof/${hex}.png`);
    expect(response.status).toBe(200);
    expect(fake.fetched).toEqual([]);
  });
});
