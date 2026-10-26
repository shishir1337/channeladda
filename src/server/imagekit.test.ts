import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteFromImageKit,
  fetchFromImageKit,
  findOnImageKit,
  onImageKit,
  signedOriginalUrl,
  uploadToImageKit,
} from "@/server/imagekit";

// The real SDK, with the network stood in for: what is under test is what
// would be sent to ImageKit, and what is done with its answers.

const hex = "b".repeat(32);
const PRIVATE_KEY = "private_test_key";

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];
let answer: (call: Call) => Response;

beforeEach(() => {
  vi.stubEnv(
    "NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT",
    "https://ik.imagekit.io/test",
  );
  vi.stubEnv("NEXT_PUBLIC_IMAGEKIT_FOLDER", "");
  vi.stubEnv("IMAGEKIT_PRIVATE_KEY", PRIVATE_KEY);
  calls = [];
  answer = () => Response.json({});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const call = {
        url: String(input instanceof Request ? input.url : input),
        init,
      };
      // The SDK checks this runtime's FormData with a data: URL first.
      if (call.url.startsWith("data:")) return new Response("");
      calls.push(call);
      return answer(call);
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function form(call: Call): FormData {
  expect(call.init?.body).toBeInstanceOf(FormData);
  return call.init?.body as FormData;
}

describe("onImageKit", () => {
  it("is on once the endpoint is set, and off without it", () => {
    expect(onImageKit()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT", "");
    expect(onImageKit()).toBe(false);
  });
});

describe("uploadToImageKit", () => {
  it("stores a cover as a public file under its own name, never renamed", async () => {
    answer = () =>
      Response.json({ fileId: "f1", filePath: `/uploads/cover/${hex}.png` });
    await uploadToImageKit(`cover/${hex}.png`, Buffer.from("png"), "image/png");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://upload.imagekit.io/api/v1/files/upload");
    const body = form(calls[0]);
    expect(body.get("fileName")).toBe(`${hex}.png`);
    expect(body.get("folder")).toBe("/uploads/cover");
    expect(body.get("useUniqueFileName")).toBe("false");
    expect(body.get("overwriteFile")).toBe("false");
    expect(body.get("isPrivateFile")).toBe("false");
    // Signed with the private key, as ImageKit's API asks: the key is the
    // user name; the SDK puts a placeholder of its own as the password.
    const auth = new Headers(calls[0].init?.headers).get("authorization") ?? "";
    expect(auth).toMatch(/^Basic /);
    const user = Buffer.from(auth.slice(6), "base64").toString().split(":")[0];
    expect(user).toBe(PRIVATE_KEY);
  });

  it("stores proofs, chat files and ID checks as private files", async () => {
    for (const kind of ["proof", "message", "kyc"]) {
      calls = [];
      answer = () =>
        Response.json({ fileId: "f", filePath: `/uploads/${kind}/${hex}.png` });
      await uploadToImageKit(
        `${kind}/${hex}.png`,
        Buffer.from("x"),
        "image/png",
      );
      expect(form(calls[0]).get("isPrivateFile"), kind).toBe("true");
    }
  });

  it("refuses a file ImageKit put anywhere but where it was asked", async () => {
    answer = () =>
      Response.json({ fileId: "f", filePath: `/uploads/cover/${hex}_x1.png` });
    await expect(
      uploadToImageKit(`cover/${hex}.png`, Buffer.from("x"), "image/png"),
    ).rejects.toThrow(/not where it was sent/);
  });

  it("says plainly when the private key is missing", async () => {
    vi.stubEnv("IMAGEKIT_PRIVATE_KEY", "");
    await expect(
      uploadToImageKit(`cover/${hex}.png`, Buffer.from("x"), "image/png"),
    ).rejects.toThrow(/IMAGEKIT_PRIVATE_KEY/);
  });
});

describe("signedOriginalUrl", () => {
  it("is a short-lived link to the original, signed with the private key", () => {
    const before = Math.floor(Date.now() / 1000);
    const url = new URL(signedOriginalUrl(`kyc/${hex}.jpg`, 60));
    expect(url.origin + url.pathname).toBe(
      `https://ik.imagekit.io/test/uploads/kyc/${hex}.jpg`,
    );
    // The bytes as they were sent: never converted to another format.
    expect(url.searchParams.get("tr")).toBe("orig-true");
    const expires = Number(url.searchParams.get("ik-t"));
    expect(expires).toBeGreaterThanOrEqual(before + 60);
    expect(expires).toBeLessThanOrEqual(before + 62);
    // ImageKit's documented signature: the path after the endpoint, then
    // the expiry, under HMAC-SHA1 with the private key.
    const signed = `uploads/kyc/${hex}.jpg?tr=orig-true${expires}`;
    expect(url.searchParams.get("ik-s")).toBe(
      createHmac("sha1", PRIVATE_KEY).update(signed).digest("hex"),
    );
  });
});

describe("finding and deleting", () => {
  it("finds a file by its name in its folder", async () => {
    answer = () =>
      Response.json([
        { type: "file", fileId: "f9", filePath: `/uploads/proof/${hex}.png` },
      ]);
    expect(await findOnImageKit(`proof/${hex}.png`)).toEqual({ fileId: "f9" });
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/v1/files");
    expect(url.searchParams.get("path")).toBe("/uploads/proof");
    expect(url.searchParams.get("searchQuery")).toBe(`name = "${hex}.png"`);
  });

  it("deletes what it finds, and nothing when nothing is there", async () => {
    answer = (call) =>
      call.init?.method === "DELETE"
        ? new Response(null, { status: 204 })
        : Response.json([
            {
              type: "file",
              fileId: "f9",
              filePath: `/uploads/proof/${hex}.png`,
            },
          ]);
    await deleteFromImageKit(`proof/${hex}.png`);
    expect(calls.map((c) => c.init?.method ?? "GET")).toEqual([
      "GET",
      "DELETE",
    ]);
    expect(calls[1].url).toBe("https://api.imagekit.io/v1/files/f9");

    calls = [];
    answer = () => Response.json([]);
    await deleteFromImageKit(`proof/${hex}.png`);
    expect(calls.map((c) => c.init?.method ?? "GET")).toEqual(["GET"]);
  });
});

describe("fetchFromImageKit", () => {
  it("asks for the range the browser asked for, from a signed link", async () => {
    answer = () =>
      new Response("abc", {
        status: 206,
        headers: { "content-range": "bytes 0-2/10" },
      });
    const response = await fetchFromImageKit(`message/${hex}.mp4`, "bytes=0-2");
    expect(response?.status).toBe(206);
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe(`/test/uploads/message/${hex}.mp4`);
    expect(url.searchParams.get("ik-s")).toBeTruthy();
    expect(new Headers(calls[0].init?.headers).get("range")).toBe("bytes=0-2");
  });

  it("is nothing for a file ImageKit does not have", async () => {
    answer = () => new Response("gone", { status: 404 });
    expect(await fetchFromImageKit(`proof/${hex}.png`, null)).toBeNull();
  });
});
