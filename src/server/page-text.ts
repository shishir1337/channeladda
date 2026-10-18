import "server-only";

import { request } from "node:https";
import type { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip } from "node:zlib";

/**
 * A public page's HTML, read with the limits a page read needs.
 *
 * `fetch` has neither of them: it reads a body of any size into memory, and
 * follows a redirect to anywhere. This caps what is read (counted after
 * decompression), follows redirects only to the hosts it is given, and holds
 * one deadline across the answer and the whole body — a timeout that fires
 * while a 3MB page is still arriving is reported as one, not as a crash.
 */
export class PageReadError extends Error {
  constructor(
    message: string,
    readonly kind: "timeout" | "too-large" | "redirect" | "failed",
  ) {
    super(message);
    this.name = "PageReadError";
  }
}

export async function readPage(
  url: string,
  options: {
    headers: Record<string, string>;
    /** For the whole read, answer and body together. */
    timeoutMs: number;
    maxBytes: number;
    /** Hosts a redirect may lead to. Anything else is refused. */
    allowHosts: RegExp;
    redirects?: number;
  },
): Promise<{ status: number; text: string }> {
  const deadline = Date.now() + options.timeoutMs;
  let current = new URL(url);

  for (let hop = 0; hop <= (options.redirects ?? 3); hop++) {
    if (
      current.protocol !== "https:" ||
      !options.allowHosts.test(current.hostname)
    ) {
      throw new PageReadError(
        `Refused to read ${current.hostname}.`,
        "redirect",
      );
    }

    const result = await once(current, options, deadline);
    if (result.location) {
      current = new URL(result.location, current);
      continue;
    }
    return { status: result.status, text: result.text };
  }
  throw new PageReadError("Too many redirects.", "redirect");
}

function once(
  url: URL,
  options: { headers: Record<string, string>; maxBytes: number },
  deadline: number,
): Promise<{ status: number; text: string; location?: string }> {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      reject(new PageReadError("The page did not answer in time.", "timeout"));
      return;
    }

    const req = request(url, {
      method: "GET",
      // Compressed, the channel page is a few hundred kilobytes, not three
      // megabytes. The cap below counts what it inflates to.
      headers: { ...options.headers, "accept-encoding": "br, gzip" },
    });
    const timer = setTimeout(() => {
      req.destroy(
        new PageReadError("The page did not answer in time.", "timeout"),
      );
    }, remaining);

    req.on("response", (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location) {
        res.resume();
        clearTimeout(timer);
        resolve({ status, text: "", location });
        return;
      }

      const encoding = res.headers["content-encoding"];
      const body: Readable =
        encoding === "gzip"
          ? res.pipe(createGunzip())
          : encoding === "br"
            ? res.pipe(createBrotliDecompress())
            : res;

      const chunks: Buffer[] = [];
      let size = 0;
      body.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > options.maxBytes) {
          const tooLarge = new PageReadError(
            "The page is larger than expected.",
            "too-large",
          );
          clearTimeout(timer);
          reject(tooLarge);
          // All three, not just the request: a decompressor that is merely
          // ignored keeps inflating what it already holds — a few hundred
          // bytes of brotli can be hundreds of megabytes.
          body.removeAllListeners("data");
          body.destroy();
          res.destroy();
          req.destroy(tooLarge);
          return;
        }
        chunks.push(chunk);
      });
      body.on("end", () => {
        clearTimeout(timer);
        resolve({ status, text: Buffer.concat(chunks).toString("utf8") });
      });
      body.on("error", (error) => {
        clearTimeout(timer);
        reject(
          error instanceof PageReadError
            ? error
            : new PageReadError(error.message, "failed"),
        );
      });
      // A destroyed request ends the response with an error, not an "end".
      res.on("aborted", () => {
        clearTimeout(timer);
        reject(
          new PageReadError("The page did not answer in time.", "timeout"),
        );
      });
    });
    req.on("error", (error) => {
      clearTimeout(timer);
      reject(
        error instanceof PageReadError
          ? error
          : new PageReadError(error.message, "failed"),
      );
    });
    req.end();
  });
}
