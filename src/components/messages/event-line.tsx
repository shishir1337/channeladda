import Link from "next/link";
import { chatTime } from "@/lib/chat-time";
import { cn } from "@/lib/utils";

/**
 * One line of the deal's history: "Nadia accepted $2,200", "Payment received".
 *
 * Quiet and centred, so the conversation still reads as people talking, with
 * the record running through it. No buttons: what can be done now is in the
 * deal panel, once, not repeated on every line that led up to it. The one
 * exception is a link, not a button: the line that opened a deal, in a chat
 * about several listings, can turn the page to that deal's panel.
 */
export function EventLine({
  message,
  className,
  action = null,
}: {
  message: { body: string; createdAt: string };
  className?: string;
  /** Where the line takes the reader, e.g. to the deal it opened. */
  action?: { href: string; label: string } | null;
}) {
  return (
    <li className={cn("flex items-center gap-3", className)}>
      <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-line" />
      <p className="max-w-[46ch] text-center text-xs leading-relaxed text-muted">
        {/* A deal reference never splits at its hyphen ("CA-" / "11235"):
            lines written before eventText used a non-breaking one too. */}
        {message.body.replace(/\b([A-Z]{2})-(\d+)\b/g, "$1‑$2")}
        <span aria-hidden="true" className="mx-1.5 text-line-strong">
          ·
        </span>
        <span className="whitespace-nowrap text-subtle tabular-nums">
          {chatTime(message.createdAt)}
        </span>
        {action ? (
          <>
            <span aria-hidden="true" className="mx-1.5 text-line-strong">
              ·
            </span>
            {/* A finger-sized target around small words, without moving
                the line. */}
            <Link
              href={action.href}
              replace
              scroll={false}
              className="-my-3 inline-flex min-h-11 items-center font-medium whitespace-nowrap text-muted underline-offset-4 transition-colors duration-150 hover:text-fg hover:underline pointer-fine:my-0 pointer-fine:min-h-0"
            >
              {action.label}
            </Link>
          </>
        ) : null}
      </p>
      <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-line" />
    </li>
  );
}
