"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ChevronsUpDownIcon,
  ExternalLinkIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MailWarningIcon,
  ShieldCheckIcon,
  ShieldIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export type ShellUser = {
  name: string;
  email: string;
  emailVerified: boolean;
  role: string;
};

const ROLE_LABEL: Record<string, string> = {
  SUPERADMIN: "Superadmin",
  MODERATOR: "Moderator",
  FINANCE: "Finance",
  AGENT: "Agent",
};

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-linear-to-b from-surface-2 to-surface-3 text-[0.6875rem] font-semibold text-fg ring-1 ring-line ring-inset",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

const item =
  "flex h-11 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[0.8125rem] text-muted outline-none select-none transition-colors pointer-fine:h-8 data-[highlighted]:bg-surface-2 data-[highlighted]:text-fg [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-subtle data-[highlighted]:[&_svg]:text-fg";

/**
 * Who is signed in, and the way out.
 *
 * Fed from the server rather than the client session hook, so it never
 * flashes "Sign in" while the session loads — the layout already knows.
 */
export function UserMenu({
  user,
  area,
  variant = "sidebar",
  collapsed = false,
}: {
  user: ShellUser;
  area: "member" | "staff";
  variant?: "sidebar" | "compact";
  collapsed?: boolean;
}) {
  const router = useRouter();
  const role = ROLE_LABEL[user.role];
  const agent = user.role === "AGENT";
  const staff = Boolean(role);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={`Account menu for ${user.name}`}
        className={cn(
          "group flex cursor-pointer items-center rounded-md text-left outline-none transition-colors duration-150 hover:bg-black/[0.04] focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-black/[0.04] dark:hover:bg-white/[0.06] dark:data-[state=open]:bg-white/[0.06]",
          variant === "sidebar" && !collapsed && "w-full gap-2.5 p-1.5",
          variant === "sidebar" &&
            collapsed &&
            "mx-auto size-10 justify-center",
          variant === "compact" && "size-11 justify-center pointer-fine:size-9",
        )}
      >
        <Avatar name={user.name} />
        {variant === "sidebar" && !collapsed ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.8125rem] leading-5 font-medium text-fg">
                {user.name}
              </span>
              <span className="block truncate text-xs leading-4 text-subtle">
                {role ?? user.email}
              </span>
            </span>
            <ChevronsUpDownIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 text-subtle transition-colors group-hover:text-muted"
            />
          </>
        ) : null}
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={variant === "sidebar" ? "top" : "bottom"}
          align={variant === "sidebar" ? "start" : "end"}
          sideOffset={6}
          collisionPadding={8}
          className="z-50 w-60 origin-[var(--radix-dropdown-menu-content-transform-origin)] rounded-lg border border-line bg-surface p-1 shadow-lift data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in"
        >
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Avatar name={user.name} className="size-8" />
            <div className="min-w-0">
              <p className="truncate text-[0.8125rem] font-medium text-fg">
                {user.name}
              </p>
              <p className="truncate text-xs text-subtle">{user.email}</p>
            </div>
          </div>

          {!user.emailVerified ? (
            <DropdownMenu.Item asChild>
              <Link
                href="/verify-email"
                className={cn(
                  item,
                  "text-primary-text [&_svg]:text-primary-text",
                )}
              >
                <MailWarningIcon aria-hidden="true" />
                Confirm your email
              </Link>
            </DropdownMenu.Item>
          ) : null}

          <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-line" />

          {area === "staff" ? (
            <DropdownMenu.Item asChild>
              <Link href="/dashboard" className={item}>
                <LayoutDashboardIcon aria-hidden="true" />
                Your account
              </Link>
            </DropdownMenu.Item>
          ) : staff ? (
            <DropdownMenu.Item asChild>
              <Link href={agent ? "/admin/deals" : "/admin"} className={item}>
                <ShieldIcon aria-hidden="true" />
                {agent ? "Deal desk" : "Staff area"}
              </Link>
            </DropdownMenu.Item>
          ) : null}
          {area === "member" ? (
            <DropdownMenu.Item asChild>
              <Link href="/dashboard/security" className={item}>
                <ShieldCheckIcon aria-hidden="true" />
                Security
              </Link>
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Item asChild>
            <Link href="/browse" className={item}>
              <ExternalLinkIcon aria-hidden="true" />
              Marketplace
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-line" />
          <DropdownMenu.Item
            className={item}
            onSelect={async () => {
              await authClient.signOut();
              // Refresh so server components drop the signed-in view.
              router.push("/");
              router.refresh();
            }}
          >
            <LogOutIcon aria-hidden="true" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
