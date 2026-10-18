import { chatTime } from "@/lib/chat-time";
import { cn } from "@/lib/utils";

/**
 * One line of the deal's history: "Nadia accepted $2,200", "Payment received".
 *
 * Quiet and centred, so the conversation still reads as people talking, with
 * the record running through it. No buttons: what can be done now is in the
 * deal panel, once, not repeated on every line that led up to it.
 */
export function EventLine({
  message,
  className,
}: {
  message: { body: string; createdAt: string };
  className?: string;
}) {
  return (
    <li className={cn("flex items-center gap-3", className)}>
      <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-line" />
      <p className="max-w-[46ch] text-center text-xs leading-relaxed text-muted">
        {message.body}
        <span aria-hidden="true" className="mx-1.5 text-line-strong">
          ·
        </span>
        <span className="whitespace-nowrap text-subtle tabular-nums">
          {chatTime(message.createdAt)}
        </span>
      </p>
      <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-line" />
    </li>
  );
}
