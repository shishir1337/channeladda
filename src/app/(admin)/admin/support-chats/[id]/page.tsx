import { ArrowUpRightIcon, EyeIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Waited } from "@/components/admin/vocab";
import { CHAT_FILL, CHAT_WINDOW } from "@/components/messages/chat-layout";
import { ThreadHeader } from "@/components/messages/chat-parts";
import { LiveRefresh } from "@/components/messages/live-refresh";
import { toMessageViews } from "@/components/messages/serialize";
import { ThreadView } from "@/components/messages/thread-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ESCROW_AGENT_NAME, SUPPORT_CHATS_HREF } from "@/lib/support-chat";
import { cn } from "@/lib/utils";
import { replyToSupport } from "@/server/actions/support-chat";
import { requireRole } from "@/server/session";
import {
  supportChatFingerprint,
  supportChatForStaff,
} from "@/server/support-chat";

export const metadata: Metadata = {
  title: "Support chat",
  robots: { index: false, follow: false },
};

/** Who may open a member's account page: `requireStaff`, which is not AGENT. */
const OPENS_PEOPLE = ["MODERATOR", "FINANCE", "SUPERADMIN"] as const;

/**
 * One member's Escrow Agent chat, for the desk: who they are, everything
 * they and the team wrote, and the box to reply in.
 */
export default async function SupportChatPage({
  params,
}: PageProps<"/admin/support-chats/[id]">) {
  const { id } = await params;
  const staff = await requireRole("AGENT", "MODERATOR", "FINANCE");
  // Before the chat is read, for the reason the deal chat gives.
  const fingerprint = await supportChatFingerprint(id, staff);
  const chat = await supportChatForStaff(id, staff);
  if (!chat || !fingerprint) notFound();

  const firstName = chat.member.name.split(/\s+/)[0] || chat.member.name;
  const opensPeople = (OPENS_PEOPLE as readonly string[]).includes(staff.role);

  return (
    // The same window-height view as the conversation desk: header on top,
    // reply box at the bottom, only the messages scrolling between — at
    // every computer width, with no second column to make room for. On a
    // phone the page fills the screen and hands back the shell's bottom
    // padding, so the reply box ends it (see chat-layout).
    <div className="@container -mb-16">
      <div className={cn(CHAT_FILL, CHAT_WINDOW)}>
        <LiveRefresh
          conversationId={chat.id}
          fingerprint={fingerprint}
          url={`/api/support-chat/fingerprint?thread=${encodeURIComponent(chat.id)}`}
        />

        <ThreadHeader
          back={{ href: SUPPORT_CHATS_HREF, label: "All support chats" }}
          people={[chat.member.name]}
          title={chat.member.name}
          subtitle={chat.member.email}
          meta={
            chat.awaitingSince ? (
              <Waited since={chat.awaitingSince} warnAfter={1} lateAfter={6} />
            ) : (
              <Badge variant="neutral" size="sm">
                Answered
              </Badge>
            )
          }
          actions={
            opensPeople ? (
              <Button asChild size="sm" variant="secondary">
                <Link href={`/admin/users/${chat.member.id}`}>
                  Their account
                  <ArrowUpRightIcon aria-hidden="true" />
                </Link>
              </Button>
            ) : null
          }
        />

        <div className="mt-5 flex min-h-0 min-w-0 flex-1 flex-col">
          <ThreadView
            conversationId={chat.id}
            sendWith={replyToSupport.bind(null, chat.id)}
            otherSide={chat.member.name}
            closed={false}
            viewerRole="staff"
            messages={toMessageViews(chat.messages)}
            notice={
              <p className="mx-auto flex max-w-[66ch] items-center gap-2 px-1 text-xs leading-relaxed text-muted">
                <EyeIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-subtle"
                />
                <span>
                  {firstName} sees every reply as the {ESCROW_AGENT_NAME}, not
                  by name.
                </span>
              </p>
            }
            empty={{
              title: "No messages yet",
              body: `${firstName} has not written anything yet.`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
