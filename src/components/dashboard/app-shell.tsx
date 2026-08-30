"use client";

import {
  ArrowLeftRightIcon,
  BadgeCheckIcon,
  ChevronsLeftIcon,
  CoinsIcon,
  ExternalLinkIcon,
  HandshakeIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  MenuIcon,
  MessageSquareIcon,
  PlusIcon,
  SettingsIcon,
  ShieldCheckIcon,
  StoreIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountMenu } from "@/components/auth/account-menu";
import { ChannelAddaLogo } from "@/components/icons/brand-icons";
import { ThemeToggle } from "@/components/site/theme-toggle";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Icons cannot cross from a Server Component into a Client one, so the nav is
 * described with icon *names* and resolved to components here.
 */
const ICONS = {
  overview: LayoutDashboardIcon,
  offers: HandshakeIcon,
  listings: StoreIcon,
  new: PlusIcon,
  settings: SettingsIcon,
  review: BadgeCheckIcon,
  staff: ShieldCheckIcon,
  money: CoinsIcon,
  transfer: ArrowLeftRightIcon,
  messages: MessageSquareIcon,
  people: UsersIcon,
  support: LifeBuoyIcon,
} as const;

export type NavIcon = keyof typeof ICONS;

export type NavItem = {
  label: string;
  href: string;
  icon: NavIcon;
  /**
   * How many things on this page are waiting on the person looking at it.
   * Anything else — totals, unread counts, volume — does not belong here:
   * a badge that is always lit stops meaning anything.
   */
  waiting?: number;
  /** Marks the item active for any path beneath it, not just an exact match. */
  section?: boolean;
};

export type NavGroup = { label: string | null; items: NavItem[] };

function isActive(pathname: string, item: NavItem) {
  if (item.section) {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  return pathname === item.href;
}

function NavLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = isActive(pathname, item);
  const Icon = ICONS[item.icon];

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors duration-150",
        collapsed && "justify-center px-0",
        active
          ? "bg-primary-soft text-primary-text"
          : "text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      {/* The active marker is a bar rather than a colour change alone, so the
          current page is still obvious without relying on colour. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-opacity duration-150",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      <Icon aria-hidden="true" className="size-[1.15rem] shrink-0" />
      {collapsed ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <span className="flex-1 truncate">{item.label}</span>
      )}
      {item.waiting && item.waiting > 0 ? (
        <span
          className={cn(
            "inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 font-mono text-[0.6875rem] font-semibold text-primary-fg tabular-nums",
            collapsed &&
              "absolute top-1 right-1 min-w-4 px-1 text-[0.625rem] leading-4",
          )}
        >
          {item.waiting}
          <span className="sr-only"> waiting on you</span>
        </span>
      ) : null}
    </Link>
  );
}

function NavList({
  groups,
  collapsed,
  onNavigate,
}: {
  groups: NavGroup[];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Dashboard" className="flex flex-col gap-6">
      {groups.map((group, index) => (
        <div
          key={group.label ?? `group-${index}`}
          className="flex flex-col gap-1"
        >
          {group.label && !collapsed ? (
            <p className="mb-1 px-3 font-mono text-[0.625rem] font-semibold tracking-[0.14em] text-subtle uppercase">
              {group.label}
            </p>
          ) : null}
          {group.label && collapsed ? (
            <span
              aria-hidden="true"
              className="mx-auto mb-1 h-px w-6 bg-line"
            />
          ) : null}
          {group.items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

function Wordmark({ collapsed, href }: { collapsed: boolean; href: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg"
      aria-label="Channel Adda dashboard"
    >
      <ChannelAddaLogo className="size-8 shrink-0" />
      {!collapsed ? (
        <span className="font-display text-base font-bold tracking-tight">
          Channel <span className="text-primary-text">Adda</span>
        </span>
      ) : null}
    </Link>
  );
}

/**
 * The application shell.
 *
 * Deliberately not the marketing chrome: no announcement bar, no footer, no
 * marketing nav. Those belong on a shop window. This is the tool, and the
 * things that matter here are where you are, what is waiting on you, and how
 * to get to the rest of it.
 */
export function AppShell({
  groups,
  staff,
  children,
}: {
  groups: NavGroup[];
  /** Shows the staff mark in the rail so the two areas are never confused. */
  staff?: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Read the stored preference after mount and only then allow the width to
  // animate, so a collapsed rail does not visibly slide in on every page load.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("ca-sidebar") === "collapsed");
    } catch {
      // Private mode or blocked storage: the default is fine.
    }
    setMounted(true);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger here, not a value the body reads
  useEffect(() => {
    // Closes the drawer on a route change, which covers browser back and
    // forward. The link handler only covers taps.
    setDrawerOpen(false);
  }, [pathname]);

  function toggle() {
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem("ca-sidebar", next ? "collapsed" : "expanded");
      } catch {
        // Not worth failing the interaction over.
      }
      return next;
    });
  }

  const home = staff ? "/admin" : "/dashboard";

  // The header names where you are, derived from the nav rather than passed
  // down by every page — one source of truth, and it cannot drift.
  const current = groups
    .flatMap((group) => group.items.map((item) => ({ group, item })))
    .filter(({ item }) => isActive(pathname, item))
    .sort((a, b) => b.item.href.length - a.item.href.length)[0];

  return (
    <div className="min-h-dvh bg-bg">
      {/* ---- rail, desktop only ------------------------------------------ */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-surface lg:flex",
          collapsed ? "w-[4.5rem]" : "w-[16.5rem]",
          mounted && "transition-[width] duration-200 ease-out",
        )}
      >
        <div
          className={cn(
            "flex h-14 items-center border-b border-line px-4",
            collapsed && "justify-center px-0",
          )}
        >
          <Wordmark collapsed={collapsed} href={home} />
        </div>

        {staff ? (
          <div className={cn("px-4 pt-4", collapsed && "px-2")}>
            <p
              className={cn(
                "flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5 font-mono text-[0.625rem] font-semibold tracking-[0.12em] text-subtle uppercase",
                collapsed && "justify-center px-0",
              )}
            >
              <ShieldCheckIcon aria-hidden="true" className="size-3.5" />
              {!collapsed ? "Staff area" : null}
            </p>
          </div>
        ) : null}

        <div
          className={cn(
            "flex-1 overflow-y-auto px-3 py-4",
            collapsed && "px-2",
          )}
        >
          <NavList groups={groups} collapsed={collapsed} />
        </div>

        <div className={cn("border-t border-line p-3", collapsed && "px-2")}>
          <Link
            href="/browse"
            title={collapsed ? "Back to the marketplace" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg",
              collapsed && "justify-center px-0",
            )}
          >
            <ExternalLinkIcon aria-hidden="true" className="size-[1.15rem]" />
            {!collapsed ? (
              "Back to the marketplace"
            ) : (
              <span className="sr-only">Back to the marketplace</span>
            )}
          </Link>
          <button
            type="button"
            onClick={toggle}
            aria-label={
              collapsed ? "Expand the sidebar" : "Collapse the sidebar"
            }
            className={cn(
              "mt-1 flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-sm text-subtle transition-colors hover:bg-surface-2 hover:text-fg",
              collapsed && "justify-center px-0",
            )}
          >
            <ChevronsLeftIcon
              aria-hidden="true"
              className={cn(
                "size-[1.15rem] transition-transform duration-200",
                collapsed && "rotate-180",
              )}
            />
            {!collapsed ? "Collapse" : null}
          </button>
        </div>
      </aside>

      {/* ---- everything to the right of the rail -------------------------- */}
      <div className={cn(collapsed ? "lg:pl-[4.5rem]" : "lg:pl-[16.5rem]")}>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur-xl sm:px-6">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open the menu"
                className="inline-flex size-11 cursor-pointer items-center justify-center rounded-xl border border-line text-fg transition-colors hover:bg-surface-2 lg:hidden"
              >
                <MenuIcon aria-hidden="true" className="size-5" />
              </button>
            </SheetTrigger>
            <SheetContent className="w-[17rem] p-0">
              <SheetTitle className="sr-only">Dashboard menu</SheetTitle>
              <SheetDescription className="sr-only">
                Move between the parts of your account.
              </SheetDescription>
              <div className="flex h-14 items-center border-b border-line px-4">
                <Wordmark collapsed={false} href={home} />
              </div>
              <div className="px-3 py-4">
                <NavList
                  groups={groups}
                  collapsed={false}
                  onNavigate={() => setDrawerOpen(false)}
                />
              </div>
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1">
            {current?.group.label ? (
              <p className="truncate font-mono text-[0.625rem] font-semibold tracking-[0.14em] text-subtle uppercase">
                {current.group.label}
              </p>
            ) : null}
            <p className="truncate font-display text-[0.9375rem] font-bold text-fg">
              {current?.item.label ?? (staff ? "Staff" : "Your account")}
            </p>
          </div>

          <ThemeToggle />
          <AccountMenu />
        </header>

        <main id="main" className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[76rem]">{children}</div>
        </main>
      </div>
    </div>
  );
}
