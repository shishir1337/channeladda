import { ClockIcon, LockIcon } from "lucide-react";
import type { Metadata } from "next";
import { InfoTip } from "@/components/app/info-tip";
import { CHAT_FILL, CHAT_WINDOW } from "@/components/messages/chat-layout";
import {
  EscrowAgentAvatar,
  ThreadHeader,
} from "@/components/messages/chat-parts";
import { LiveRefresh } from "@/components/messages/live-refresh";
import { toMessageViews } from "@/components/messages/serialize";
import { ThreadView } from "@/components/messages/thread-view";
import { iconText } from "@/components/ui/icon-hue";
import {
  ESCROW_AGENT_HREF,
  ESCROW_AGENT_NAME,
  REPLY_PROMISE,
} from "@/lib/support-chat";
import { cn } from "@/lib/utils";
import { postToEscrowAgent } from "@/server/actions/support-chat";
import { requireUser } from "@/server/session";
import {
  escrowAgentFingerprint,
  markEscrowAgentRead,
  memberSupportThread,
} from "@/server/support-chat";

export const metadata: Metadata = {
  title: ESCROW_AGENT_NAME,
  robots: { index: false, follow: false },
};

/**
 * The deal chat's view (see chat-layout). With no deal panel to sit beside
 * the conversation, the window-height view holds at every computer width;
 * on a phone the negative margin hands back the shell's bottom padding, so
 * the message box ends the page at the bottom of the screen.
 */
const VIEW = cn(CHAT_FILL, "max-lg:-mb-28", CHAT_WINDOW);

/**
 * A member's own chat with Channel Adda's live agents.
 *
 * Always there, pinned at the top of Messages, before anything was ever
 * written: the chat is made by the first message, not by opening it. It is
 * the member's own and nobody else's — the page asks for no id, so there is
 * none to change.
 */
export default async function EscrowAgentPage() {
  const user = await requireUser(ESCROW_AGENT_HREF);
  // Before the chat is read, for the reason the deal chat gives: a reply
  // landing between the two must still move the poll.
  const fingerprint = await escrowAgentFingerprint(user.id);
  const thread = await memberSupportThread(user);
  if (thread.id) await markEscrowAgentRead(user.id);

  return (
    <div className={VIEW}>
      <LiveRefresh
        conversationId={ESCROW_AGENT_HREF}
        fingerprint={fingerprint}
        url="/api/support-chat/fingerprint"
      />

      <ThreadHeader
        back={{
          href: "/dashboard/messages",
          label: "All messages",
          phoneOnly: true,
        }}
        people={[ESCROW_AGENT_NAME]}
        avatar={
          <EscrowAgentAvatar
            className="size-8 sm:size-9"
            iconClassName="size-4 sm:size-4.5"
          />
        }
        title={ESCROW_AGENT_NAME}
        subtitle="Channel Adda live agents"
      />

      <div className="mt-5 flex min-h-0 min-w-0 flex-1 flex-col">
        <ThreadView
          conversationId={ESCROW_AGENT_HREF}
          sendWith={postToEscrowAgent}
          otherSide={ESCROW_AGENT_NAME}
          closed={false}
          viewerRole="buyer"
          messages={toMessageViews(thread.messages)}
          notice={
            <p className="mx-auto flex max-w-[66ch] items-center gap-2 px-1 text-xs leading-relaxed text-muted">
              <LockIcon
                aria-hidden="true"
                className={`size-3.5 shrink-0 ${iconText(LockIcon)}`}
              />
              <span>Only you and Channel Adda agents can read this chat.</span>
              <InfoTip label="About this chat">
                Ask about a deal, a payment, a listing or your account.{" "}
                {REPLY_PROMISE} Messages shows a badge when they do. Photos and
                clips are deleted after 48 hours. We never ask for your password
                or sign-in codes.
              </InfoTip>
            </p>
          }
          empty={{
            title: `Ask an ${ESCROW_AGENT_NAME}`,
            body: `Stuck on a deal, a payment or a listing? Write here and a Channel Adda agent will help. ${REPLY_PROMISE}`,
          }}
          after={
            thread.awaiting ? (
              <p className="flex items-center justify-center gap-1.5 px-1 text-xs text-subtle">
                <ClockIcon
                  aria-hidden="true"
                  className={`size-3.5 shrink-0 ${iconText(ClockIcon)}`}
                />
                {REPLY_PROMISE}
              </p>
            ) : null
          }
        />
      </div>
    </div>
  );
}
