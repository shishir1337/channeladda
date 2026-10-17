import { chatTime } from "@/lib/chat-time";

/**
 * One line of the deal's history: "Nadia accepted $2,200", "Payment received".
 *
 * Quiet and centred, so the conversation still reads as people talking, with
 * the record running through it. No buttons: what can be done now is in the
 * deal panel, once, not repeated on every line that led up to it.
 */
export function EventLine({
  message,
}: {
  message: { body: string; createdAt: string };
}) {
  return (
    <li className="flex justify-center">
      <p className="max-w-[46ch] rounded-card border border-line bg-surface-2 px-3.5 py-1.5 text-center text-xs leading-relaxed text-muted">
        {message.body}
        <span className="ml-2 text-subtle tabular-nums">
          {chatTime(message.createdAt)}
        </span>
      </p>
    </li>
  );
}
