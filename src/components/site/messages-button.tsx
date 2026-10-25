"use client";

import { MessageSquareIcon } from "lucide-react";
import Link from "next/link";
import { useMemberCounts } from "@/components/site/member-counts";
import { iconText } from "@/components/ui/icon-hue";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/**
 * Messages, one click from anywhere on the website: a round button in the
 * bottom right corner, the icon alone, with the unread count on its corner
 * (the owner, 2026-10-26). Desktop only — below 1024px the tab bar carries
 * Messages already. Signed in only: a visitor has no chats, and the
 * header's Sign in is the way in for them.
 */
export function MessagesButton() {
  const { data: session } = useSession();
  const counts = useMemberCounts();
  if (!session?.user) return null;

  const unread = counts?.messages ?? 0;
  const label =
    unread > 0
      ? `Messages, ${unread} ${unread === 1 ? "chat" : "chats"} unread`
      : "Messages";

  return (
    <Link
      href="/dashboard/messages"
      aria-label={label}
      title="Messages"
      className="fixed right-6 bottom-6 z-40 hidden size-14 items-center justify-center rounded-full border border-line bg-surface shadow-lift transition-[border-color,translate] duration-150 hover:-translate-y-0.5 hover:border-line-strong lg:inline-flex"
    >
      <MessageSquareIcon
        aria-hidden="true"
        className={cn("size-6", iconText(MessageSquareIcon))}
      />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[0.6875rem] leading-none font-semibold text-primary-fg tabular-nums ring-2 ring-bg"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
