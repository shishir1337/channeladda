"use client";

import { MessageSquareIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemberCounts } from "@/components/site/member-counts";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/**
 * Messages, one click from anywhere on the website: a round button in the
 * bottom right corner, the icon alone, with the unread count on its corner
 * (the owner, 2026-10-26). Desktop only — below 1024px the tab bar carries
 * Messages already. Signed in only: a visitor has no chats, and the
 * header's Sign in is the way in for them.
 *
 * Brand gold, not the page's surface: on the light theme a white button on
 * a white page could not be found (the owner, 2026-10-26). The count is
 * red so it reads against the gold.
 *
 * On a listing it waits for a window wider than 1400px: narrower, it sat on
 * the buy panel's button, pinned to the same corner. The listing has its own
 * way to message the seller.
 */
export function MessagesButton() {
  const { data: session } = useSession();
  const counts = useMemberCounts();
  const pathname = usePathname();
  if (!session?.user) return null;
  const onListing = pathname.startsWith("/listing/");

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
      className={cn(
        "fixed right-6 bottom-6 z-40 hidden size-14 items-center justify-center rounded-full bg-primary text-primary-fg shadow-[0_8px_24px_-6px_rgb(0_0_0/0.35),0_2px_6px_rgb(0_0_0/0.15)] ring-1 ring-black/10 transition-[background-color,translate] duration-150 ring-inset hover:-translate-y-0.5 hover:bg-primary-hover focus-visible:rounded-full",
        onListing ? "min-[87.5rem]:inline-flex" : "lg:inline-flex",
      )}
    >
      <MessageSquareIcon aria-hidden="true" className="size-6" />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[0.6875rem] leading-none font-semibold text-white tabular-nums ring-2 ring-bg"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
