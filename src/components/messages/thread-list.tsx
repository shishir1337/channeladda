import { ChevronRightIcon, FlagIcon, MessageSquareIcon } from "lucide-react";
import { InfoTip } from "@/components/app/info-tip";
import { EmptyState, List, ListItem } from "@/components/app/kit";
import { Initials } from "@/components/messages/chat-parts";
import { Badge } from "@/components/ui/badge";
import { listTime } from "@/lib/time";
import { viewerZone } from "@/server/viewer-zone";

/**
 * A list of conversations, for the staff queue: one row per buyer and
 * seller, naming the listing they talked about last and how many more.
 */

export type ThreadRow = {
  id: string;
  /** The listing talked about last. */
  listingTitle: string;
  listingHandle: string;
  /** How many other listings the two have talked about here. */
  moreListings: number;
  withName: string;
  lastMessageAt: string;
  preview: string;
  unread: number;
  flagged: boolean;
  closed: boolean;
  flagReason?: string | null;
};

export async function ThreadList({
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
      <EmptyState
        icon={MessageSquareIcon}
        // The title alone, with how threads arrive behind the (i).
        title={
          <span className="inline-flex items-center gap-1.5">
            {empty}
            <InfoTip label="About conversations">
              A thread appears the moment a buyer asks a seller a question, and
              stays readable here for as long as the deal behind it lasts.
            </InfoTip>
          </span>
        }
      />
    );
  }

  const zone = await viewerZone();
  return (
    <List>
      {threads.map((thread) => (
        <ListItem
          key={thread.id}
          href={`${basePath}/${thread.id}`}
          // A flag is the reason this queue exists, so it marks the row's
          // edge as well as its badge.
          flag={thread.flagged ? "danger" : undefined}
        >
          <div className="flex items-start gap-3">
            <Initials
              name={thread.withName}
              className="mt-0.5 size-9 text-xs"
            />

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-3">
                <p className="min-w-0 flex-1 truncate text-sm leading-5 font-medium text-fg">
                  {thread.withName}
                </p>
                <time
                  dateTime={thread.lastMessageAt}
                  className="shrink-0 text-xs text-subtle tabular-nums"
                >
                  {listTime(thread.lastMessageAt, zone)}
                </time>
              </div>
              <p className="flex min-w-0 gap-1.5 text-xs leading-5 text-subtle">
                <span className="min-w-0 truncate">
                  {thread.listingHandle} · {thread.listingTitle}
                </span>
                {thread.moreListings > 0 ? (
                  <span className="shrink-0 tabular-nums">
                    +{thread.moreListings} more
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 truncate text-[0.8125rem] leading-5 text-muted">
                {thread.preview}
              </p>

              {thread.flagged || thread.closed || thread.unread > 0 ? (
                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                  {thread.unread > 0 ? (
                    <Badge variant="primary" size="sm" className="tabular-nums">
                      {thread.unread} new
                    </Badge>
                  ) : null}
                  {thread.flagged ? (
                    <Badge
                      variant="danger"
                      size="sm"
                      className="max-w-full min-w-0"
                    >
                      <FlagIcon aria-hidden="true" />
                      <span className="truncate">
                        {thread.flagReason ?? "Flagged for review"}
                      </span>
                    </Badge>
                  ) : null}
                  {thread.closed ? (
                    <Badge variant="neutral" size="sm">
                      Closed
                    </Badge>
                  ) : null}
                </div>
              ) : null}
            </div>

            <ChevronRightIcon
              aria-hidden="true"
              className="mt-2.5 size-4 shrink-0 text-subtle transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-muted"
            />
          </div>
        </ListItem>
      ))}
    </List>
  );
}
