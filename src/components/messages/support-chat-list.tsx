import { ChevronRightIcon } from "lucide-react";
import { Waited } from "@/components/admin/vocab";
import { List, ListItem } from "@/components/app/kit";
import { Initials } from "@/components/messages/chat-parts";
import { SUPPORT_CHATS_HREF } from "@/lib/support-chat";
import { listTime } from "@/lib/time";
import { viewerZone } from "@/server/viewer-zone";

/**
 * Escrow Agent chats, for the desk. Drawn like the conversation queue, so a
 * moderator who reads one reads the other; a waiting chat says for how long.
 */
export type SupportChatRowView = {
  id: string;
  memberName: string;
  memberEmail: string;
  awaitingSince: Date | null;
  lastMessageAt: Date;
  preview: string;
};

export async function SupportChatList({
  chats,
}: {
  chats: SupportChatRowView[];
}) {
  const zone = await viewerZone();
  return (
    <List>
      {chats.map((chat) => (
        <ListItem
          key={chat.id}
          href={`${SUPPORT_CHATS_HREF}/${chat.id}`}
          // Waiting is the reason this queue exists, so it marks the edge.
          flag={chat.awaitingSince ? "primary" : undefined}
        >
          <div className="flex items-start gap-3">
            <Initials
              name={chat.memberName}
              className="mt-0.5 size-9 text-xs"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-3">
                <p className="min-w-0 flex-1 truncate text-sm leading-5 font-medium text-fg">
                  {chat.memberName}
                </p>
                <time
                  dateTime={chat.lastMessageAt.toISOString()}
                  className="shrink-0 text-xs text-subtle tabular-nums"
                >
                  {listTime(chat.lastMessageAt, zone)}
                </time>
              </div>
              <p className="truncate text-xs leading-5 text-subtle">
                {chat.memberEmail}
              </p>
              <p className="mt-0.5 truncate text-[0.8125rem] leading-5 text-muted">
                {chat.preview}
              </p>
              {chat.awaitingSince ? (
                <div className="mt-2">
                  <Waited
                    since={chat.awaitingSince}
                    warnAfter={1}
                    lateAfter={6}
                  />
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
