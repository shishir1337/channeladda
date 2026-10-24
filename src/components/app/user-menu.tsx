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
  UserRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeMenuItem } from "@/components/site/theme-toggle";
import { authClient } from "@/lib/auth-client";
import { needsEmailVerification } from "@/lib/email-verification";
import { cn } from "@/lib/utils";

export type ShellUser = {
  name: string;
  email: string;
  emailVerified: boolean;
  role: string;
  /** Their profile photo, when they have added one. */
  image?: string | null;
  /** Their public page's handle, once they have one. */
  slug?: string | null;
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
  image,
  className,
}: {
  name: string;
  image?: string | null;
  className?: string;
}) {
  const shape = cn(
    "inline-flex size-7 shrink-0 items-center justify-center rounded-full ring-1 ring-line ring-inset",
    className,
  );
  if (image) {
    return (
      // biome-ignore lint/performance/noImgElement: a small square of the member's own upload, served from our origin.
      <img
        src={image}
        alt=""
        aria-hidden="true"
        className={cn(shape, "bg-surface-2 object-cover")}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        shape,
        "bg-linear-to-b from-surface-2 to-surface-3 text-[0.6875rem] font-semibold text-fg",
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
          // One shape open or folded: the avatar holds its place and the
          // rail's own width decides how much of the rest shows.
          variant === "sidebar" && "w-full gap-2.5 overflow-hidden p-1.5",
          variant === "compact" && "size-11 justify-center pointer-fine:size-9",
        )}
      >
        <Avatar name={user.name} image={user.image} />
        {variant === "sidebar" ? (
          <span
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2.5 transition-opacity",
              collapsed
                ? "opacity-0 duration-100"
                : "opacity-100 duration-200 delay-100",
            )}
          >
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
          </span>
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
            <Avatar name={user.name} image={user.image} className="size-8" />
            <div className="min-w-0">
              <p className="truncate text-[0.8125rem] font-medium text-fg">
                {user.name}
              </p>
              <p className="truncate text-xs text-subtle">{user.email}</p>
            </div>
          </div>

          {needsEmailVerification(user) ? (
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
              <Link href="/dashboard/profile" className={item}>
                <UserRoundIcon aria-hidden="true" />
                Your profile
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
          <ThemeMenuItem className={item} />

          <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-line" />
          <DropdownMenu.Item className={item} onSelect={() => signOut(router)}>
            <LogOutIcon aria-hidden="true" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

async function signOut(router: ReturnType<typeof useRouter>) {
  await authClient.signOut();
  // Refresh so server components drop the signed-in view.
  router.push("/");
  router.refresh();
}

/** The way out, as a row of its own at the foot of the phone's menu. */
export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => signOut(router)}
      className="flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-md px-3 text-sm text-muted transition-colors duration-150 hover:bg-white/[0.05] hover:text-fg"
    >
      <LogOutIcon aria-hidden="true" className="size-4 shrink-0" />
      Sign out
    </button>
  );
}
