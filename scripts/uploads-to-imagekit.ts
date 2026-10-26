/**
 * Copies every upload on this server's disk to ImageKit, once, when the
 * site's files move there. Run it on the server after setting the ImageKit
 * lines in `.env` and before restarting:
 *
 *   pnpm media:to-imagekit
 *
 * Each file goes up under its own key, public or private as its kind
 * decides — exactly as a new upload would. A file already on ImageKit is
 * left alone, so running it twice is safe.
 *
 * Nothing on disk is deleted. While a file is still on disk the site reads
 * it from there, so `.data/uploads` can go once the files are seen to open
 * from ImageKit — by hand, not by this.
 */
import "./load-env";

import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { contentTypeOf, isKycKey, isServableKey } from "@/lib/upload-keys";
import {
  findOnImageKit,
  onImageKit,
  uploadToImageKit,
} from "@/server/imagekit";

const ROOT = resolve(process.cwd(), ".data", "uploads");

async function filesOnDisk(): Promise<string[]> {
  const keys: string[] = [];
  let kinds: string[];
  try {
    kinds = await readdir(ROOT);
  } catch {
    return keys;
  }
  for (const kind of kinds) {
    let names: string[];
    try {
      names = await readdir(join(ROOT, kind));
    } catch {
      continue;
    }
    for (const name of names) keys.push(`${kind}/${name}`);
  }
  return keys;
}

async function main() {
  if (!onImageKit() || !process.env.IMAGEKIT_PRIVATE_KEY?.trim()) {
    console.error(
      "Set NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT and IMAGEKIT_PRIVATE_KEY in .env first.",
    );
    process.exitCode = 1;
    return;
  }

  const keys = await filesOnDisk();
  console.log(`${keys.length} files on this server's disk.`);

  let copied = 0;
  let already = 0;
  let skipped = 0;
  let failed = 0;
  for (const [i, key] of keys.entries()) {
    // Only what the app itself wrote: anything else in the folder is not
    // an upload, and has no key that would ever ask for it.
    if (!isServableKey(key)) {
      skipped += 1;
      continue;
    }
    // An ID check's file is not named in a log, even by its key.
    const named = isKycKey(key) ? "an ID check file" : key;
    try {
      if (await findOnImageKit(key)) {
        already += 1;
      } else {
        await uploadToImageKit(
          key,
          await readFile(join(ROOT, key)),
          contentTypeOf(key),
        );
        copied += 1;
      }
    } catch (error) {
      // ImageKit's search takes a little while to see a new file, so one
      // copied a moment ago can be missed above and refused here.
      if (error instanceof Error && /already exists/i.test(error.message)) {
        already += 1;
        continue;
      }
      failed += 1;
      console.error(
        `Could not copy ${named}:`,
        error instanceof Error ? error.message : error,
      );
    }
    if ((i + 1) % 50 === 0) console.log(`…${i + 1} of ${keys.length}`);
  }

  console.log(
    `Copied ${copied}. Already on ImageKit ${already}. Not uploads ${skipped}. Failed ${failed}.`,
  );
  console.log("Nothing on this server was deleted.");
  if (failed > 0) {
    console.log("Run it again to retry the ones that failed.");
    process.exitCode = 1;
  }
}

main();
