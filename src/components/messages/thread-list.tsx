import { AlertTriangleIcon, MessageSquareIcon } from "lucide-react";
import Link from "next/link";

/**
 * A list of conversations.
 *
 * Shared by the member inbox and the staff queue, because they are the same
 * object seen from two sides — and a moderator who has learned to read one
 * should not have to learn the other.
 */

export type ThreadRow = {
  id: string;
  listingTitle: string;
  listingHandle: string;
  withName: string;
  lastMessageAt: string;
  preview: string;
  unread: number;
  flagged: boolean;
  closed: boolean;
  flagReason?: string | null;
};

function when(iso: string) {
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days === 0) {
    return date.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ThreadList({
  threads,
  basePath,
  empty,
}: {
  threads: ThreadRow[];
  /** "/dashboard/messages" or "/admin/messages". */
  basePath: string;
  empty: string;
}) {
  if (threads.length === 0) {
    return (
      <p className="mt-6 rounded-panel border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
        {empty}
      </p>
    );
  }

  return (
    <ul className="mt-6 grid gap-px overflow-hidden rounded-panel border border-line bg-line">
      {threads.map((thread) => (
        <li key={thread.id} className="bg-surface">
          <Link
            href={`${basePath}/${thread.id}`}
            className="flex items-start gap-3.5 p-4 transition-colors hover:bg-surface-2"
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${
                thread.flagged
                  ? "bg-danger-soft text-danger"
                  : "bg-surface-2 text-subtle"
              }`}
            >
              {thread.flagged ? (
                <AlertTriangleIcon className="size-4" />
              ) : (
                <MessageSquareIcon className="size-4" />
              )}
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-medium text-fg">{thread.withName}</span>
                <span className="truncate text-xs text-subtle">
                  {thread.listingHandle} · {thread.listingTitle}
                </span>
                <span className="ml-auto shrink-0 text-xs text-subtle">
                  {when(thread.lastMessageAt)}
                </span>
              </span>

              <span className="mt-1 block truncate text-sm text-muted">
                {thread.preview}
              </span>

              {thread.flagged || thread.closed || thread.unread > 0 ? (
                <span className="mt-2 flex flex-wrap items-center gap-2">
                  {thread.unread > 0 ? (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-fg">
                      {thread.unread} new
                    </span>
                  ) : null}
                  {thread.flagged ? (
                    <span className="rounded-full border border-danger/30 bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
                      {thread.flagReason ?? "Flagged for review"}
                    </span>
                  ) : null}
                  {thread.closed ? (
                    <span className="rounded-full border border-line px-2 py-0.5 text-xs text-subtle">
                      Closed
                    </span>
                  ) : null}
                </span>
              ) : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
