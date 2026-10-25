"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowLeftRightIcon,
  BellIcon,
  CoinsIcon,
  ExternalLinkIcon,
  HandshakeIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  LogOutIcon,
  type LucideIcon,
  MailWarningIcon,
  MessageSquareIcon,
  PlusIcon,
  SettingsIcon,
  ShieldIcon,
  StoreIcon,
  UserRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemberCounts } from "@/components/site/member-counts";
import { Button } from "@/components/ui/button";
import { HUE_TEXT, iconText } from "@/components/ui/icon-hue";
import { authClient, useSession } from "@/lib/auth-client";
import { needsEmailVerification } from "@/lib/email-verification";
import type { MemberCounts } from "@/lib/site-dock";
import { cn } from "@/lib/utils";

const itemClass =
  "flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm text-muted outline-none select-none data-[highlighted]:bg-surface-2 data-[highlighted]:text-fg";

const groupLabel =
  "px-3 pt-1 pb-1 text-[0.6875rem] font-medium tracking-wide text-subtle uppercase";

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * The places in an account, as the dashboard's rail has them — the same
 * names, icons and colours — so the menu is the rail in a dropdown. The
 * owner found it held three links, and the rest meant opening the
 * dashboard first. Plus, a control, takes the rail's yellow; the rest wear
 * their icon's own colour.
 */
type Place = {
  label: string;
  href: string;
  icon: LucideIcon;
  tint?: string;
  count?: keyof MemberCounts;
};

const PLACES: { label: string | null; items: Place[] }[] = [
  {
    label: null,
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon },
    ],
  },
  {
    label: "Trading",
    items: [
      {
        label: "Deals",
        href: "/dashboard/deals",
        icon: ArrowLeftRightIcon,
        count: "deals",
      },
      { label: "Offers", href: "/dashboard/offers", icon: HandshakeIcon },
      {
        label: "Messages",
        href: "/dashboard/messages",
        icon: MessageSquareIcon,
        count: "messages",
      },
    ],
  },
  {
    label: "Selling",
    items: [
      { label: "Your listings", href: "/dashboard/listings", icon: StoreIcon },
      {
        label: "List an account",
        href: "/dashboard/listings/new",
        icon: PlusIcon,
        tint: HUE_TEXT.yellow,
      },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Wallet", href: "/dashboard/wallet", icon: CoinsIcon },
      { label: "Profile", href: "/dashboard/profile", icon: UserRoundIcon },
      {
        label: "Notifications",
        href: "/dashboard/notifications",
        icon: BellIcon,
      },
      { label: "Security", href: "/dashboard/security", icon: SettingsIcon },
    ],
  },
];

/** Things waiting on the reader, as the rail counts them: gold, not filled. */
function WaitingCount({ count }: { count: number }) {
  return (
    <span className="ml-auto inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-primary-soft px-1.5 text-[0.6875rem] leading-none font-semibold text-primary-text tabular-nums ring-1 ring-primary/25 ring-inset">
      {count > 99 ? "99+" : count}
      <span className="sr-only"> waiting on you</span>
    </span>
  );
}

function PlaceItem({ place, count }: { place: Place; count?: number }) {
  const Icon = place.icon;
  return (
    <DropdownMenu.Item asChild>
      <Link href={place.href} className={itemClass}>
        <Icon
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0",
            place.tint ?? iconText(Icon, HUE_TEXT.sky),
          )}
        />
        {place.label}
        {count ? <WaitingCount count={count} /> : null}
      </Link>
    </DropdownMenu.Item>
  );
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
  const counts = useMemberCounts();

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

  const user = session.user as typeof session.user & {
    role?: string | null;
    slug?: string | null;
  };
  const isStaff =
    user.role === "MODERATOR" ||
    user.role === "FINANCE" ||
    user.role === "SUPERADMIN";
  // An agent's desk is the deal desk alone; without this link their only
  // way there was typing the address.
  const staffLink = isStaff
    ? { href: "/admin", label: "Staff area" }
    : user.role === "AGENT"
      ? { href: "/admin/deals", label: "Deal desk" }
      : null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          "inline-flex h-11 cursor-pointer items-center gap-2 rounded-[10px] pr-3 pl-1.5 text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg data-[state=open]:bg-surface-2 data-[state=open]:text-fg",
          className,
        )}
        aria-label={`Account menu for ${user.name}`}
      >
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-xs font-semibold text-fg ring-1 ring-line ring-inset"
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
          collisionPadding={12}
          className="z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] w-[16.5rem] overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lift data-[state=closed]:animate-[fade-out_160ms_ease-in] data-[state=open]:animate-[fade-in_200ms_ease-out]"
        >
          <div className="flex items-center gap-3 px-3 py-2.5">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-xs font-semibold text-fg ring-1 ring-line ring-inset"
            >
              {initialsOf(user.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-fg">
                {user.name}
              </p>
              <p className="truncate text-xs text-subtle">{user.email}</p>
            </div>
          </div>

          {user.slug ? (
            <DropdownMenu.Item asChild>
              <Link href={`/seller/${user.slug}`} className={itemClass}>
                <ExternalLinkIcon
                  aria-hidden="true"
                  className={cn("size-4 shrink-0", HUE_TEXT.cyan)}
                />
                Your public page
              </Link>
            </DropdownMenu.Item>
          ) : null}

          {needsEmailVerification(user) ? (
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

          {PLACES.map((group) => (
            <DropdownMenu.Group key={group.label ?? "home"}>
              <DropdownMenu.Separator className="my-1.5 h-px bg-line" />
              {group.label ? (
                <DropdownMenu.Label className={groupLabel}>
                  {group.label}
                </DropdownMenu.Label>
              ) : null}
              {group.items.map((place) => (
                <PlaceItem
                  key={place.href}
                  place={place}
                  count={place.count ? counts?.[place.count] : undefined}
                />
              ))}
            </DropdownMenu.Group>
          ))}

          {staffLink ? (
            <>
              <DropdownMenu.Separator className="my-1.5 h-px bg-line" />
              <DropdownMenu.Item asChild>
                <Link href={staffLink.href} className={itemClass}>
                  <ShieldIcon
                    aria-hidden="true"
                    className={cn("size-4 shrink-0", HUE_TEXT.indigo)}
                  />
                  {staffLink.label}
                </Link>
              </DropdownMenu.Item>
            </>
          ) : null}

          <DropdownMenu.Separator className="my-1.5 h-px bg-line" />
          <DropdownMenu.Item asChild>
            <Link href="/help" className={itemClass}>
              <LifeBuoyIcon
                aria-hidden="true"
                className={cn("size-4 shrink-0", iconText(LifeBuoyIcon))}
              />
              Help centre
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={itemClass}
            onSelect={async () => {
              await authClient.signOut();
              // Refresh so server components drop the signed-in view.
              router.push("/");
              router.refresh();
            }}
          >
            <LogOutIcon aria-hidden="true" className="size-4 shrink-0" />
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
