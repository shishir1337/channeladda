"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The phone's tab bar, in parts: the bar, a tab that is a link, and a tab
 * that is a button ("More").
 *
 * It is the dashboard's bar (`TabBar` in the app shell), drawn the same way
 * to the pixel, so the website and the account read as one app: the same
 * 60px tabs, the same gold line over the lit one, the lit icon in its own
 * colour and the rest grey, the same counts. Phones and tablets only — the
 * same `lg` line where the dashboard's rail takes over.
 */
export function Dock({ children }: { children: ReactNode }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md backdrop-saturate-150 lg:hidden"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">{children}</ul>
    </nav>
  );
}

const tabClass =
  "relative flex h-15 w-full flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors duration-150";

export function DockLink({
  href,
  label,
  icon: Icon,
  tint,
  active,
  waiting,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  /** The icon's colour (`@/components/ui/icon-hue`), shown while it is lit. */
  tint: string;
  active: boolean;
  /** Things on that page waiting on the reader; nothing else is counted. */
  waiting?: number;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          tabClass,
          active ? "text-fg" : "text-subtle active:text-fg",
        )}
      >
        {active ? (
          <span
            aria-hidden="true"
            className="absolute top-0 h-0.5 w-8 rounded-full bg-primary"
          />
        ) : null}
        <span className="relative">
          <Icon aria-hidden="true" className={cn("size-5", active && tint)} />
          {waiting ? <DockCount count={waiting} /> : null}
        </span>
        {label}
        {waiting ? (
          <span className="sr-only">, {waiting} waiting on you</span>
        ) : null}
      </Link>
    </li>
  );
}

/**
 * A tab that opens something rather than going somewhere. Every other prop
 * reaches the button, so it also works as a Radix trigger (`asChild`).
 */
export function DockButton({
  label,
  icon: Icon,
  waiting,
  className,
  ...props
}: ComponentProps<"button"> & {
  label: string;
  icon: LucideIcon;
  waiting?: number;
}) {
  return (
    <li>
      <button
        type="button"
        className={cn(
          tabClass,
          "cursor-pointer text-subtle active:text-fg",
          className,
        )}
        {...props}
      >
        <span className="relative">
          <Icon aria-hidden="true" className="size-5" />
          {waiting ? <DockCount count={waiting} /> : null}
        </span>
        {label}
        {waiting ? (
          <span className="sr-only">, {waiting} waiting on you</span>
        ) : null}
      </button>
    </li>
  );
}

/** A count on a tab icon: filled gold, so it is seen at a glance. */
function DockCount({ count }: { count: number }) {
  return (
    <span
      aria-hidden="true"
      className="absolute -top-1.5 -right-2.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] leading-none font-bold text-primary-fg tabular-nums ring-2 ring-bg"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
