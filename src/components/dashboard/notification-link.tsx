"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { readOne } from "@/server/actions/notifications";

/**
 * A notification's link, which marks it read before it goes.
 *
 * The bell used to fire the read beside the click and let the page change
 * under it, and the Notifications page sent none: QA came back to "10 of
 * these have not been read yet" after opening them. Waiting for the read
 * first costs one quick round trip and means the next page's bell is right.
 * A new-tab click goes at once, with the read sent alongside.
 */
export function NotificationLink({
  id,
  href,
  unread,
  className,
  onOpened,
  children,
}: {
  id: string;
  href: string;
  unread: boolean;
  className?: string;
  /** After the read, as the page changes: the bell closes its panel. */
  onOpened?: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (!unread) {
      onOpened?.();
      return;
    }
    const newTab =
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey;
    if (newTab) {
      void readOne(id);
      return;
    }
    event.preventDefault();
    startTransition(async () => {
      await readOne(id);
      onOpened?.();
      router.push(href);
    });
  }

  return (
    <Link
      href={href}
      onClick={open}
      aria-busy={pending || undefined}
      className={cn(className, pending && "opacity-70")}
    >
      {children}
    </Link>
  );
}
