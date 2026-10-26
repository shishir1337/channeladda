import Link from "next/link";
import { Fragment } from "react";
import { splitLinks } from "@/lib/guide-text";

/** A guide's line of text, with its links to our own pages as links. */
export function GuideText({ text }: { text: string }) {
  return splitLinks(text).map((piece, i) =>
    piece.kind === "link" ? (
      <Link
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed text, split the same way on every render.
        key={i}
        href={piece.href}
        className="font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-fg"
      >
        {piece.text}
      </Link>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: fixed text, split the same way on every render.
      <Fragment key={i}>{piece.text}</Fragment>
    ),
  );
}
