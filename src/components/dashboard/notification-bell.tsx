"use client";

import {
  BellIcon,
  CheckCheckIcon,
  CircleDollarSignIcon,
  FileTextIcon,
  GavelIcon,
  MessageSquareIcon,
  StarIcon,
  TagIcon,
  WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
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
          "relative inline-flex size-11 cursor-pointer items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-fg",
          open && "bg-surface-2 text-fg",
        )}
      >
        <BellIcon aria-hidden="true" className="size-[1.15rem]" />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="tnum absolute top-1.5 right-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.5625rem] font-bold text-primary-on ring-2 ring-bg"
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
          className="absolute right-0 z-50 mt-2 flex max-h-[min(32rem,70vh)] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-card border border-line bg-surface shadow-lift"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <p className="font-display text-sm font-bold text-fg">
              Notifications
            </p>
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
                className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-fg disabled:opacity-60"
              >
                <CheckCheckIcon aria-hidden="true" className="size-3.5" />
                Mark all read
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <BellIcon
                aria-hidden="true"
                className="mx-auto size-8 text-subtle"
              />
              <p className="mt-3 text-sm font-medium text-fg">
                Nothing yet
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
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
                        "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg",
                        unreadRow
                          ? "bg-primary-soft text-primary-text"
                          : "bg-surface-2 text-subtle",
                      )}
                    >
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-sm leading-snug",
                          unreadRow
                            ? "font-semibold text-fg"
                            : "font-medium text-muted",
                        )}
                      >
                        {item.title}
                      </span>
                      <span className="mt-0.5 block line-clamp-2 text-xs leading-relaxed text-muted">
                        {item.body}
                      </span>
                      <span className="mt-1 block text-[0.6875rem] text-subtle">
                        {ago(item.createdAt)}
                        {unreadRow ? (
                          <span className="sr-only"> · unread</span>
                        ) : null}
                      </span>
                    </span>
                  </>
                );

                const className = cn(
                  "flex w-full gap-3 px-4 py-3 text-left transition-colors",
                  unreadRow ? "bg-primary/[0.03]" : null,
                  item.href ? "hover:bg-surface-2" : null,
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

          <div className="border-t border-line px-4 py-2.5">
            <Link
              href="/dashboard/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-xs font-semibold text-primary-text transition-colors hover:text-fg"
            >
              See everything
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
