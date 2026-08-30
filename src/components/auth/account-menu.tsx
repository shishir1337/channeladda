"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  HandshakeIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MailWarningIcon,
  ShieldIcon,
  StoreIcon,
  UserRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const itemClass =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm text-muted outline-none select-none data-[highlighted]:bg-surface-2 data-[highlighted]:text-fg";

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Sign-in link, or the signed-in account menu.
 *
 * Renders the signed-out state while the session is still loading rather than
 * a spinner: the header would otherwise shift on every page load, and a
 * visitor who is signed in sees the correct state a moment later.
 */
export function AccountMenu({ className }: { className?: string }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  if (isPending || !session?.user) {
    return (
      <Button asChild variant="ghost" size="sm" className={className}>
        <Link href="/signin">
          <UserRoundIcon aria-hidden="true" className="size-4" />
          Sign in
        </Link>
      </Button>
    );
  }

  const user = session.user as typeof session.user & { role?: string | null };
  const isStaff =
    user.role === "MODERATOR" ||
    user.role === "FINANCE" ||
    user.role === "SUPERADMIN";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          "inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-line pr-3 pl-1.5 text-sm font-medium text-muted transition-colors duration-200 hover:border-line-strong hover:bg-surface-2 hover:text-fg data-[state=open]:bg-surface-2 data-[state=open]:text-fg",
          className,
        )}
        aria-label={`Account menu for ${user.name}`}
      >
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-xs font-bold text-primary-text"
        >
          {initialsOf(user.name)}
        </span>
        <span className="max-w-[7rem] truncate">
          {user.name.split(/\s+/)[0]}
        </span>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[15rem] overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-lift data-[state=closed]:animate-[fade-out_160ms_ease-in] data-[state=open]:animate-[fade-in_200ms_ease-out]"
        >
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-fg">
              {user.name}
            </p>
            <p className="truncate text-xs text-subtle">{user.email}</p>
          </div>

          {!user.emailVerified ? (
            <DropdownMenu.Item asChild>
              <Link
                href="/verify-email"
                className={cn(itemClass, "text-primary-text")}
              >
                <MailWarningIcon aria-hidden="true" className="size-4" />
                Confirm your email
              </Link>
            </DropdownMenu.Item>
          ) : null}

          <DropdownMenu.Separator className="my-1.5 h-px bg-line" />

          <DropdownMenu.Item asChild>
            <Link href="/dashboard" className={itemClass}>
              <LayoutDashboardIcon aria-hidden="true" className="size-4" />
              Dashboard
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/dashboard/listings" className={itemClass}>
              <StoreIcon aria-hidden="true" className="size-4" />
              Your listings
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/dashboard/offers" className={itemClass}>
              <HandshakeIcon aria-hidden="true" className="size-4" />
              Offers
            </Link>
          </DropdownMenu.Item>

          {isStaff ? (
            <>
              <DropdownMenu.Separator className="my-1.5 h-px bg-line" />
              <DropdownMenu.Item asChild>
                <Link href="/admin" className={itemClass}>
                  <ShieldIcon aria-hidden="true" className="size-4" />
                  Staff area
                </Link>
              </DropdownMenu.Item>
            </>
          ) : null}

          <DropdownMenu.Separator className="my-1.5 h-px bg-line" />
          <DropdownMenu.Item
            className={itemClass}
            onSelect={async () => {
              await authClient.signOut();
              // Refresh so server components drop the signed-in view.
              router.push("/");
              router.refresh();
            }}
          >
            <LogOutIcon aria-hidden="true" className="size-4" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * The same choice inside the mobile menu sheet, where a dropdown inside a
 * dropdown would be awkward. Plain links instead.
 */
export function MobileAccountLinks({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  if (isPending || !session?.user) {
    return (
      <Button asChild variant="secondary" size="md">
        <Link href="/signin" onClick={onNavigate}>
          Sign in
        </Link>
      </Button>
    );
  }

  return (
    <>
      <Button asChild variant="secondary" size="md">
        <Link href="/dashboard" onClick={onNavigate}>
          Dashboard
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="md"
        onClick={async () => {
          await authClient.signOut();
          onNavigate?.();
          router.push("/");
          router.refresh();
        }}
      >
        Sign out
      </Button>
    </>
  );
}
