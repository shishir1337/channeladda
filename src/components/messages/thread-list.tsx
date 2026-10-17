import { AlertTriangleIcon, MessageSquareIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

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
      <div className="mt-6 flex flex-col items-center rounded-panel border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-subtle">
          <MessageSquareIcon aria-hidden="true" className="size-5" />
        </span>
        <p className="mt-4 font-display text-base font-bold text-fg">{empty}</p>
        <p className="mx-auto mt-1.5 max-w-[48ch] text-sm leading-relaxed text-muted">
          A thread appears the moment a buyer asks a seller a question, and
          stays readable here for as long as the deal behind it lasts.
        </p>
      </div>
    );
  }

  return (
    <ul className="mt-6 grid gap-px overflow-hidden rounded-panel border border-line bg-line">
      {threads.map((thread) => (
        <li key={thread.id} className="bg-surface">
          <Link
            href={`${basePath}/${thread.id}`}
            className="flex items-start gap-3.5 p-4 transition-colors duration-200 hover:bg-surface-2 sm:p-5"
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl ${
                thread.flagged
                  ? "bg-danger-soft text-danger"
                  : "bg-surface-2 text-subtle"
              }`}
            >
              {thread.flagged ? (
                <AlertTriangleIcon className="size-[1.15rem]" />
              ) : (
                <MessageSquareIcon className="size-[1.15rem]" />
              )}
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-[0.9375rem] font-semibold text-fg">
                  {thread.withName}
                </span>
                <span className="min-w-0 truncate text-xs text-subtle">
                  {thread.listingHandle} · {thread.listingTitle}
                </span>
                <span className="ml-auto shrink-0 text-xs text-subtle">
                  {when(thread.lastMessageAt)}
                </span>
              </span>

              <span className="mt-1.5 block truncate text-sm text-muted">
                {thread.preview}
              </span>

              {thread.flagged || thread.closed || thread.unread > 0 ? (
                <span className="mt-2.5 flex flex-wrap items-center gap-2">
                  {thread.unread > 0 ? (
                    <Badge variant="solid" size="sm">
                      {thread.unread} new
                    </Badge>
                  ) : null}
                  {thread.flagged ? (
                    <Badge variant="danger" size="sm">
                      <AlertTriangleIcon aria-hidden="true" />
                      {thread.flagReason ?? "Flagged for review"}
                    </Badge>
                  ) : null}
                  {thread.closed ? (
                    <Badge variant="neutral" size="sm">
                      Closed
                    </Badge>
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
