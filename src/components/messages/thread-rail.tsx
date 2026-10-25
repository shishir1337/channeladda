"use client";

import { SearchIcon, ShieldCheckIcon, ZapIcon } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { inputClass, SeeAll } from "@/components/app/kit";
import { EscrowAgentAvatar, Initials } from "@/components/messages/chat-parts";
import { Badge } from "@/components/ui/badge";
import { ESCROW_AGENT_HREF, ESCROW_AGENT_NAME } from "@/lib/support-chat";
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
 *
 * The Escrow Agent sits above all of it, outside the filter: a member who
 * needs help should find it in the same place every time, however many
 * conversations they have and whatever they last typed into the box.
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
  /** The deal still running here: these rows are listed first. */
  deal: { reference: string; mode: "SAFEST" | "FASTEST" } | null;
};

/** The pinned Escrow Agent row. */
export type RailEscrowAgent = {
  preview: string;
  /** Null until the member first writes. */
  lastMessageAt: string | null;
  unread: boolean;
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

export function ThreadRail({
  threads,
  escrowAgent,
}: {
  threads: RailThread[];
  escrowAgent: RailEscrowAgent;
}) {
  const params = useParams<{ id?: string }>();
  const pathname = usePathname();
  const agentOpen = pathname === ESCROW_AGENT_HREF;
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
  const deals = shown.filter((thread) => thread.deal);
  const others = shown.filter((thread) => !thread.deal);

  return (
    <aside
      aria-labelledby={headingId}
      className={cn(
        "flex flex-col max-lg:mb-6 lg:sticky lg:top-[5.5rem] lg:h-[calc(100dvh-6.5rem)] lg:border-r lg:border-line lg:pr-4",
        // On a phone there is no room for both panes: an open thread takes
        // the screen, and the list is one tap back. Never empty: the Escrow
        // Agent is always in it.
        (params?.id || agentOpen) && "max-lg:hidden",
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

      <div className="-mx-1 mt-3 p-1">
        <EscrowAgentRow agent={escrowAgent} active={agentOpen} />
      </div>

      {threads.length === 0 ? (
        // The page under it says so on a phone, with the way to start one.
        <p className="mt-2 px-1 text-[0.8125rem] leading-relaxed text-muted max-lg:hidden">
          No other conversations yet.
        </p>
      ) : (
        <>
          <div className="relative mt-2">
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
            // scroll edge, which would otherwise clip them. `relative` keeps
            // the rows' screen-reader "Unread" inside the scroll: placed
            // against the rail instead, those below the fold stretched the
            // page past the window and let it scroll.
            <div className="relative -mx-1 mt-1 flex min-h-0 flex-col gap-3 p-1 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
              {/* Running deals first, under their own heading: they are what
                  somebody has to act on. The server already lists them first;
                  the split here is only the headings. */}
              {deals.length > 0 ? (
                <Group
                  label="Running deals"
                  threads={deals}
                  activeId={params?.id}
                />
              ) : null}
              {others.length > 0 ? (
                <Group
                  label={deals.length > 0 ? "Other conversations" : null}
                  threads={others}
                  activeId={params?.id}
                />
              ) : null}
            </div>
          )}
        </>
      )}
    </aside>
  );
}

function Group({
  label,
  threads,
  activeId,
}: {
  /** Null when there is only one group, which needs no heading. */
  label: string | null;
  threads: RailThread[];
  activeId?: string;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={label ? headingId : undefined}>
      {label ? (
        <h3
          id={headingId}
          className="px-2.5 pb-1 text-[0.6875rem] font-semibold tracking-wide text-subtle uppercase"
        >
          {label}
        </h3>
      ) : null}
      <ul className="flex flex-col gap-px">
        {threads.map((thread) => (
          <li key={thread.id}>
            <ThreadRow thread={thread} active={activeId === thread.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The Escrow Agent. Quiet like every row, told apart by its shield and the
 * line under the name rather than by colour across the whole row.
 */
function EscrowAgentRow({
  agent,
  active,
}: {
  agent: RailEscrowAgent;
  active: boolean;
}) {
  return (
    <Link
      href={ESCROW_AGENT_HREF}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-[background-color,box-shadow] duration-150 focus-visible:-outline-offset-2",
        active
          ? "bg-surface shadow-xs ring-1 ring-line dark:bg-surface-2"
          : "hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
      )}
    >
      <EscrowAgentAvatar className="mt-0.5 size-9" iconClassName="size-4.5" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
            {ESCROW_AGENT_NAME}
          </span>
          {agent.lastMessageAt ? (
            <time
              dateTime={agent.lastMessageAt}
              className={cn(
                "shrink-0 text-xs tabular-nums",
                agent.unread ? "text-fg" : "text-subtle",
              )}
            >
              {when(agent.lastMessageAt)}
            </time>
          ) : null}
        </span>
        <span className="block truncate text-xs leading-5 text-subtle">
          Channel Adda live agents
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[0.8125rem] leading-5",
              agent.unread ? "text-fg" : "text-muted",
            )}
          >
            {agent.preview}
          </span>
          {agent.unread ? (
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full bg-primary"
            />
          ) : null}
        </span>
      </span>
      {agent.unread ? <span className="sr-only">Unread</span> : null}
    </Link>
  );
}

function ThreadRow({
  thread,
  active,
}: {
  thread: RailThread;
  active: boolean;
}) {
  const DealIcon = thread.deal?.mode === "FASTEST" ? ZapIcon : ShieldCheckIcon;
  return (
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
      <Initials name={thread.withName} className="mt-0.5 size-9 text-xs" />
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
        <span className="flex items-center gap-1.5">
          {thread.deal ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs leading-5 font-medium text-primary-text tabular-nums">
              <DealIcon aria-hidden="true" className="size-3" />
              {thread.deal.reference}
            </span>
          ) : null}
          <span className="min-w-0 truncate text-xs leading-5 text-subtle">
            {thread.listingTitle}
          </span>
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
            <Badge variant={thread.closed ? "neutral" : "danger"} size="sm">
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
      {thread.unread ? <span className="sr-only">Unread</span> : null}
    </Link>
  );
}
