"use client";

import { AlertTriangleIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The conversation rail.
 *
 * A filter box rather than a scroll: once somebody has twenty threads, the one
 * they want is below the fold and they know its name. Filtering on the client
 * because the whole list is already here — a round trip per keystroke would be
 * slower and would lose the list while it loaded.
 *
 * The active thread is read from the route rather than passed in, so the rail
 * does not need re-rendering from the server when the selection changes.
 */
export type RailThread = {
  id: string;
  listingTitle: string;
  listingHandle: string;
  withName: string;
  lastMessageAt: string;
  preview: string;
  unread: boolean;
  flagged: boolean;
  closed: boolean;
};

function when(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days < 7) return date.toLocaleDateString("en-US", { weekday: "short" });
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function ThreadRail({ threads }: { threads: RailThread[] }) {
  const params = useParams<{ id?: string }>();
  const filterId = useId();
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((thread) =>
      [thread.listingTitle, thread.listingHandle, thread.withName]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [threads, query]);

  if (threads.length === 0) {
    return (
      <p className="mt-4 text-sm leading-relaxed text-muted">
        No conversations yet. Ask a question on any listing and the thread
        starts here.
      </p>
    );
  }

  return (
    <>
      <div className="relative mt-3">
        <label htmlFor={filterId} className="sr-only">
          Filter conversations
        </label>
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle"
        />
        <input
          id={filterId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by account or person"
          className="h-10 w-full rounded-xl border border-line bg-surface pr-3 pl-9 text-sm text-fg placeholder:text-subtle focus:outline-none"
        />
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nothing matches that.</p>
      ) : (
        <ul className="mt-3 flex max-h-[60vh] flex-col gap-1 overflow-y-auto lg:max-h-[calc(100vh-16rem)]">
          {shown.map((thread) => {
            const active = params?.id === thread.id;
            return (
              <li key={thread.id}>
                <Link
                  href={`/dashboard/messages/${thread.id}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block rounded-card border px-3 py-2.5 transition-colors duration-200",
                    active
                      ? "border-primary bg-primary-soft"
                      : "border-transparent hover:border-line hover:bg-surface-2",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p
                      className={cn(
                        "min-w-0 truncate text-sm",
                        thread.unread
                          ? "font-semibold text-fg"
                          : "font-medium text-fg",
                      )}
                    >
                      {thread.withName}
                    </p>
                    <span className="shrink-0 text-[0.6875rem] text-subtle">
                      {when(thread.lastMessageAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 min-w-0 truncate text-xs text-muted">
                    {thread.listingTitle}
                  </p>
                  <p
                    className={cn(
                      "mt-1 min-w-0 truncate text-xs",
                      thread.unread ? "text-fg" : "text-subtle",
                    )}
                  >
                    {thread.preview || "No messages yet"}
                  </p>
                  {thread.flagged || thread.closed ? (
                    <p className="mt-1.5 flex items-center gap-1 text-[0.6875rem] text-danger">
                      <AlertTriangleIcon
                        aria-hidden="true"
                        className="size-3"
                      />
                      {thread.closed ? "Closed by Channel Adda" : "Flagged"}
                    </p>
                  ) : null}
                  {thread.unread ? (
                    <span className="sr-only">Unread</span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
