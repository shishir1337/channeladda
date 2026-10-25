import { MessagesSquareIcon } from "lucide-react";
import type { Metadata } from "next";
import { elapsed } from "@/components/admin/vocab";
import {
  AllClear,
  EmptyState,
  MetaItem,
  PageHeader,
  Section,
} from "@/components/app/kit";
import { SupportChatList } from "@/components/messages/support-chat-list";
import { ESCROW_AGENT_NAME } from "@/lib/support-chat";
import { requireRole } from "@/server/session";
import { listSupportChats } from "@/server/support-chat";

export const metadata: Metadata = {
  title: "Support chats",
  robots: { index: false, follow: false },
};

/**
 * Every member's Escrow Agent chat.
 *
 * Chats waiting for a reply come first, the longest wait at the top; then
 * the answered ones, newest first. The live agents answer here — agents,
 * moderators, finance and the superadmin (`SUPPORT_CHAT_ROLES`).
 */
export default async function SupportChatsPage() {
  await requireRole("AGENT", "MODERATOR", "FINANCE");
  const chats = await listSupportChats();
  const waiting = chats.filter((chat) => chat.awaitingSince !== null);
  const answered = chats.filter((chat) => chat.awaitingSince === null);
  // Listed longest wait first, so the first row is the oldest.
  const oldest = waiting[0]?.awaitingSince;

  return (
    <>
      <PageHeader
        title="Support chats"
        info={`Members write to the ${ESCROW_AGENT_NAME} from their Messages. They see every reply as the ${ESCROW_AGENT_NAME}, never your name.`}
        meta={
          oldest ? (
            <MetaItem label="Longest wait">{elapsed(oldest).label}</MetaItem>
          ) : undefined
        }
      />

      <Section
        id="waiting"
        title="Waiting for a reply"
        count={waiting.length}
        tone={waiting.length > 0 ? "primary" : "neutral"}
      >
        {waiting.length === 0 ? (
          <AllClear
            title="Nobody is waiting"
            body="Every member who wrote has had a reply."
          />
        ) : (
          <SupportChatList chats={waiting} />
        )}
      </Section>

      <Section id="answered" title="Answered" count={answered.length}>
        {answered.length === 0 ? (
          <EmptyState
            icon={MessagesSquareIcon}
            title="No answered chats yet"
            body="A chat lands here once an agent has replied. It moves back up when the member writes again."
          />
        ) : (
          <SupportChatList chats={answered} />
        )}
      </Section>
    </>
  );
}
