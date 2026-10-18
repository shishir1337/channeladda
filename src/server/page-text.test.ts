import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { gzipSync } from "node:zlib";
import { beforeEach, expect, test, vi } from "vitest";

/**
 * What the fake server answers, by URL. Each answer is a status, headers and
 * a body; `hang` never answers at all.
 */
type Answer =
  | { status: number; headers?: Record<string, string>; body?: Buffer | string }
  | "hang";

const server = vi.hoisted(() => ({
  answers: new Map<string, Answer>(),
  asked: [] as string[],
}));

vi.mock("node:https", () => ({
  request: (url: URL) => {
    server.asked.push(url.href);
    const req = new EventEmitter() as EventEmitter & {
      end: () => void;
      destroy: (error?: Error) => void;
    };
    req.destroy = (error) => {
      if (error) queueMicrotask(() => req.emit("error", error));
    };
    req.end = () => {
      const answer = server.answers.get(url.href);
      if (!answer || answer === "hang") return;
      const res = new PassThrough() as PassThrough & {
        statusCode: number;
        headers: Record<string, string>;
      };
      res.statusCode = answer.status;
      res.headers = answer.headers ?? {};
      queueMicrotask(() => {
        req.emit("response", res);
        res.end(answer.body ?? "");
      });
    };
    return req;
  },
}));

const { readPage, PageReadError } = await import("@/server/page-text");

const OPTIONS = {
  headers: {},
  timeoutMs: 1_000,
  maxBytes: 1_000,
  allowHosts: /^(www\.)?youtube\.com$/,
};

beforeEach(() => {
  server.answers.clear();
  server.asked = [];
});

test("a page is read, whole", async () => {
  server.answers.set("https://www.youtube.com/@a/about", {
    status: 200,
    body: "<html>channel</html>",
  });
  expect(await readPage("https://www.youtube.com/@a/about", OPTIONS)).toEqual({
    status: 200,
    text: "<html>channel</html>",
  });
});

test("a compressed page is inflated", async () => {
  server.answers.set("https://www.youtube.com/@a/about", {
    status: 200,
    headers: { "content-encoding": "gzip" },
    body: gzipSync("<html>squeezed</html>"),
  });
  const { text } = await readPage("https://www.youtube.com/@a/about", OPTIONS);
  expect(text).toBe("<html>squeezed</html>");
});

test("a host that was not allowed is never asked", async () => {
  await expect(
    readPage("https://evil.test/@a/about", OPTIONS),
  ).rejects.toBeInstanceOf(PageReadError);
  await expect(
    readPage("http://www.youtube.com/@a/about", OPTIONS),
  ).rejects.toBeInstanceOf(PageReadError);
  expect(server.asked).toEqual([]);
});

test("a redirect is followed within the site, and refused out of it", async () => {
  server.answers.set("https://www.youtube.com/c/old/about", {
    status: 301,
    headers: { location: "/@new/about" },
  });
  server.answers.set("https://www.youtube.com/@new/about", {
    status: 200,
    body: "moved",
  });
  expect(
    (await readPage("https://www.youtube.com/c/old/about", OPTIONS)).text,
  ).toBe("moved");

  server.answers.set("https://www.youtube.com/@away/about", {
    status: 302,
    headers: { location: "https://169.254.169.254/latest/meta-data" },
  });
  await expect(
    readPage("https://www.youtube.com/@away/about", OPTIONS),
  ).rejects.toMatchObject({ kind: "redirect" });
  expect(server.asked).not.toContain(
    "https://169.254.169.254/latest/meta-data",
  );
});

test("a page larger than the cap is not read past it", async () => {
  server.answers.set("https://www.youtube.com/@big/about", {
    status: 200,
    body: "x".repeat(5_000),
  });
  await expect(
    readPage("https://www.youtube.com/@big/about", OPTIONS),
  ).rejects.toMatchObject({ kind: "too-large" });
});

test("a page that never answers is given up on at the deadline", async () => {
  server.answers.set("https://www.youtube.com/@slow/about", "hang");
  await expect(
    readPage("https://www.youtube.com/@slow/about", {
      ...OPTIONS,
      timeoutMs: 50,
    }),
  ).rejects.toMatchObject({ kind: "timeout" });
});
