import { randomBytes } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";

// ImageKit itself is stood in for (its own tests are in imagekit.test.ts):
// what is under test is which files go there, and which stay on disk.
const ik = vi.hoisted(() => ({
  on: false,
  uploaded: [] as { key: string; contentType: string; bytes: number }[],
  deleted: [] as string[],
}));
vi.mock("@/server/imagekit", () => ({
  onImageKit: () => ik.on,
  uploadToImageKit: async (key: string, bytes: Buffer, contentType: string) => {
    ik.uploaded.push({ key, contentType, bytes: bytes.byteLength });
  },
  deleteFromImageKit: async (key: string) => {
    ik.deleted.push(key);
  },
}));

import { db } from "@/lib/db";
import {
  deleteUpload,
  hasLocalCopy,
  putUpload,
  sizeOfUpload,
  UploadError,
} from "@/server/storage";
import { seedUser, withCleanDb } from "@/test/db";

/** The smallest real PNG: a 1×1 transparent pixel. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

function png() {
  return new File([new Uint8Array(PNG)], "photo.png", { type: "image/png" });
}

afterEach(() => {
  ik.on = false;
  ik.uploaded = [];
  ik.deleted = [];
});

test("with ImageKit on, an upload goes there and never to the server's disk", async () => {
  ik.on = true;
  const stored = await putUpload(png(), "cover");

  expect(stored.url).toBe(`/uploads/${stored.key}`);
  expect(stored.key).toMatch(/^cover\/[0-9a-f]{32}\.png$/);
  expect(ik.uploaded).toEqual([
    { key: stored.key, contentType: "image/png", bytes: PNG.byteLength },
  ]);
  expect(await hasLocalCopy(stored.key)).toBe(false);
});

test("without ImageKit, the file is written to disk as before", async () => {
  const stored = await putUpload(png(), "proof");
  expect(await hasLocalCopy(stored.key)).toBe(true);
  expect(ik.uploaded).toEqual([]);
  await deleteUpload(stored.key);
  expect(await hasLocalCopy(stored.key)).toBe(false);
});

test("a file the checks refuse never reaches ImageKit", async () => {
  ik.on = true;
  await expect(
    putUpload(new File(["not an image"], "x.png"), "cover"),
  ).rejects.toBeInstanceOf(UploadError);
  expect(ik.uploaded).toEqual([]);
});

test("deleting removes the ImageKit copy and any copy left on disk", async () => {
  // Written to disk before the move to ImageKit, deleted after it.
  const stored = await putUpload(png(), "message");
  ik.on = true;
  await deleteUpload(stored.key);
  expect(await hasLocalCopy(stored.key)).toBe(false);
  expect(ik.deleted).toEqual([stored.key]);
});

test(
  "a file's size comes from its record once the file is not on disk",
  withCleanDb(async () => {
    ik.on = true;
    const member = await seedUser();
    const key = `message/${randomBytes(16).toString("hex")}.mp4`;
    await db.upload.create({
      data: {
        key,
        uploaderId: member.id,
        kind: "message",
        bytes: 1234,
        contentType: "video/mp4",
      },
    });
    expect(await sizeOfUpload(key)).toBe(1234);
    expect(
      await sizeOfUpload(`message/${randomBytes(16).toString("hex")}.mp4`),
    ).toBeNull();
  }),
);
