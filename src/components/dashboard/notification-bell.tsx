"use client";

import {
  BadgeCheckIcon,
  BellIcon,
  CheckCheckIcon,
  CircleDollarSignIcon,
  FileTextIcon,
  GavelIcon,
  GemIcon,
  MessageSquareIcon,
  StarIcon,
  TagIcon,
  WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { iconTile } from "@/components/ui/icon-hue";
import type { NotificationKind } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { readAll, readOne } from "@/server/actions/notifications";

/**
 * The bell.
 *
 * The `Notification` table has existed since the first migration and nothing
 * ever rendered it, so every offer, message, listing decision and payout
 * passed in silence. This is the half that reaches somebody already looking;
 * email is the half that reaches somebody who is not.
 *
 * A panel rather than a page, because the whole point is to answer "is there
 * anything?" without leaving what you were doing.
 */
export type BellItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

const ICONS: Record<NotificationKind, typeof BellIcon> = {
  MESSAGE: MessageSquareIcon,
  OFFER: TagIcon,
  ORDER: CircleDollarSignIcon,
  LISTING: FileTextIcon,
  PAYOUT: WalletIcon,
  DISPUTE: GavelIcon,
  REVIEW: StarIcon,
  BADGE: GemIcon,
  IDENTITY: BadgeCheckIcon,
};

/** "3 days" beats a date: half these readers are not reading in English. */
function ago(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function NotificationBell({
  items,
  unread,
}: {
  items: BellItem[];
  unread: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Click outside and Escape, because a panel you cannot dismiss is a trap on
  // a phone where there is nowhere obvious to click.
  useEffect(() => {
    if (!open) return;

    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || button.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label =
    unread > 0
      ? `Notifications — ${unread} unread`
      : "Notifications — nothing new";

  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((was) => !was)}
        className={cn(
          "relative inline-flex size-11 cursor-pointer items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-black/[0.05] hover:text-fg pointer-fine:size-8 dark:hover:bg-white/[0.06]",
          open && "bg-black/[0.05] text-fg dark:bg-white/[0.06]",
        )}
      >
        <BellIcon aria-hidden="true" className="size-4" />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="absolute top-2 right-2 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-[0.1875rem] text-[0.5625rem] leading-none font-semibold text-primary-fg tabular-nums ring-2 ring-bg pointer-fine:top-0.5 pointer-fine:right-0.5"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          ref={panel}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 flex max-h-[min(32rem,70vh)] w-[min(23rem,calc(100vw-1.5rem))] origin-top-right animate-pop-in flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-lift max-sm:fixed max-sm:inset-x-3 max-sm:top-14 max-sm:w-auto"
        >
          <div className="flex h-11 items-center justify-between gap-3 border-b border-line px-4">
            <p className="text-sm font-semibold text-fg">Notifications</p>
            {unread > 0 ? (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await readAll();
                    router.refresh();
                  })
                }
                className="-mr-1.5 inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-60 pointer-fine:h-7"
              >
                <CheckCheckIcon aria-hidden="true" className="size-3.5" />
                Mark all read
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <span
                aria-hidden="true"
                className={`mx-auto inline-flex size-9 items-center justify-center rounded-lg border ${iconTile(BellIcon)}`}
              >
                <BellIcon className="size-4" />
              </span>
              <p className="mt-3 text-sm font-medium text-fg">Nothing yet</p>
              <p className="mx-auto mt-1 max-w-[30ch] text-[0.8125rem] leading-relaxed text-muted">
                Offers, messages and anything a deal needs from you land here.
              </p>
            </div>
          ) : (
            <ul className="flex-1 divide-y divide-line overflow-y-auto">
              {items.map((item) => {
                const Icon = ICONS[item.kind] ?? BellIcon;
                const unreadRow = item.readAt === null;

                const inner = (
                  <>
                    <span
                      className={cn(
                        "mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md border",
                        unreadRow
                          ? "border-primary/25 bg-primary-soft text-primary-text"
                          : "border-line bg-surface text-subtle",
                      )}
                    >
                      <Icon aria-hidden="true" className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-[0.8125rem] leading-snug",
                          unreadRow ? "font-medium text-fg" : "text-muted",
                        )}
                      >
                        {item.title}
                      </span>
                      <span className="mt-0.5 block line-clamp-2 text-xs leading-relaxed text-subtle">
                        {item.body}
                      </span>
                      <span className="mt-1 block text-[0.6875rem] text-subtle tabular-nums">
                        {ago(item.createdAt)}
                        {unreadRow ? (
                          <span className="sr-only"> · unread</span>
                        ) : null}
                      </span>
                    </span>
                  </>
                );

                const className = cn(
                  "relative flex w-full gap-3 px-4 py-3 text-left transition-colors duration-150",
                  unreadRow
                    ? "pr-8 before:absolute before:top-[1.0625rem] before:right-4 before:size-1.5 before:rounded-full before:bg-primary"
                    : null,
                  item.href ? "hover:bg-surface-2/70" : null,
                );

                return (
                  <li key={item.id}>
                    {item.href ? (
                      <Link
                        href={item.href}
                        className={className}
                        onClick={() => {
                          setOpen(false);
                          if (unreadRow) void readOne(item.id);
                        }}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className={className}>{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="border-t border-line p-1">
            <Link
              href="/dashboard/notifications"
              onClick={() => setOpen(false)}
              className="flex h-11 items-center justify-center rounded-md text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg pointer-fine:h-8"
            >
              See everything
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
