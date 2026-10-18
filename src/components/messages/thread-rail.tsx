"use client";

import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { inputClass, SeeAll } from "@/components/app/kit";
import { Initials } from "@/components/messages/chat-parts";
import { Badge } from "@/components/ui/badge";
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
  const headingId = useId();
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

  const unreadCount = threads.filter((thread) => thread.unread).length;

  return (
    <aside
      aria-labelledby={headingId}
      className={cn(
        "flex flex-col max-lg:mb-6 lg:sticky lg:top-[5.5rem] lg:h-[calc(100dvh-6.5rem)] lg:border-r lg:border-line lg:pr-4",
        // On a phone there is no room for both panes: an open thread takes
        // the screen, and the list is one tap back. With nothing in it, the
        // page's own empty state says it better than an empty rail.
        (params?.id || threads.length === 0) && "max-lg:hidden",
      )}
    >
      <div className="flex min-h-8 items-center justify-between gap-3">
        <h2
          id={headingId}
          className="text-[0.9375rem] leading-6 font-semibold text-fg"
        >
          Conversations
        </h2>
        <SeeAll href="/browse">Find more</SeeAll>
      </div>

      {threads.length === 0 ? (
        <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
          No conversations yet.
        </p>
      ) : (
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
              className={cn(inputClass, "pl-9")}
            />
          </div>

          <p className="mt-2.5 px-1 text-xs text-subtle tabular-nums">
            {query.trim()
              ? `${shown.length} of ${threads.length} shown`
              : unreadCount > 0
                ? `${threads.length} total · ${unreadCount} unread`
                : `${threads.length} ${threads.length === 1 ? "conversation" : "conversations"}`}
          </p>

          {shown.length === 0 ? (
            <p className="mt-2 px-1 py-6 text-center text-[0.8125rem] leading-relaxed text-muted">
              Nothing matches that. Try the account handle or the person's name.
            </p>
          ) : (
            // The inset keeps the active row's ring and shadow clear of the
            // scroll edge, which would otherwise clip them.
            <ul className="-mx-1 mt-1 flex min-h-0 flex-col gap-px p-1 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
              {shown.map((thread) => {
                const active = params?.id === thread.id;
                return (
                  <li key={thread.id}>
                    <Link
                      href={`/dashboard/messages/${thread.id}`}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-[background-color,box-shadow] duration-150 focus-visible:-outline-offset-2",
                        active
                          ? "bg-surface shadow-xs ring-1 ring-line dark:bg-surface-2"
                          : "hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
                      )}
                    >
                      <Initials
                        name={thread.withName}
                        className="mt-0.5 size-9 text-xs"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate text-sm text-fg",
                              thread.unread ? "font-medium" : "font-normal",
                            )}
                          >
                            {thread.withName}
                          </span>
                          <time
                            dateTime={thread.lastMessageAt}
                            className={cn(
                              "shrink-0 text-xs tabular-nums",
                              thread.unread ? "text-fg" : "text-subtle",
                            )}
                          >
                            {when(thread.lastMessageAt)}
                          </time>
                        </span>
                        <span className="block truncate text-xs leading-5 text-subtle">
                          {thread.listingTitle}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2">
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate text-[0.8125rem] leading-5",
                              thread.unread ? "text-fg" : "text-muted",
                            )}
                          >
                            {thread.preview || "No messages yet"}
                          </span>
                          {thread.flagged || thread.closed ? (
                            <Badge
                              variant={thread.closed ? "neutral" : "danger"}
                              size="sm"
                            >
                              {thread.closed ? "Closed" : "Flagged"}
                            </Badge>
                          ) : null}
                          {thread.unread ? (
                            <span
                              aria-hidden="true"
                              className="size-2 shrink-0 rounded-full bg-primary"
                            />
                          ) : null}
                        </span>
                      </span>
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
      )}
    </aside>
  );
}
