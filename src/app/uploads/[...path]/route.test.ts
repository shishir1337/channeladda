import { beforeEach, expect, test, vi } from "vitest";

// The route on its own: who is asking, whether they may read the file and
// the bytes on disk are all stood in for, so what is under test is the
// headers it answers with.
const fake = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/server/session", () => ({ getCurrentUser: async () => null }));
vi.mock("@/server/upload-access", () => ({
  canReadUpload: async () => fake.allowed,
}));
vi.mock("@/server/storage", () => ({
  UploadError: class UploadError extends Error {},
  readUpload: async () => ({
    bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]),
    contentType: "image/png",
  }),
}));

const hex = "a".repeat(32);

async function get(key: string) {
  const { GET } = await import("@/app/uploads/[...path]/route");
  return GET(new Request(`http://localhost/uploads/${key}`), {
    params: Promise.resolve({ path: key.split("/") }),
  } as Parameters<typeof GET>[1]);
}

beforeEach(() => {
  fake.allowed = true;
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
