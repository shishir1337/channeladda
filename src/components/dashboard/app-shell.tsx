"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import {
  ArrowLeftRightIcon,
  BadgeCheckIcon,
  BellIcon,
  ChevronRightIcon,
  CoinsIcon,
  GavelIcon,
  HandshakeIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  MenuIcon,
  MessageSquareIcon,
  PanelLeftIcon,
  PlusIcon,
  SettingsIcon,
  ShieldCheckIcon,
  StoreIcon,
  UsersIcon,
} from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { type ShellUser, UserMenu } from "@/components/app/user-menu";
import { ChannelAddaLogo } from "@/components/icons/brand-icons";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { WalletChip } from "@/components/site/wallet-balance";
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
  bell: BellIcon,
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
  dispute: GavelIcon,
} as const;

export type NavIcon = keyof typeof ICONS;

/**
 * Each place has its own colour, so the icons are told apart at a glance
 * rather than read: the owner found every icon the same grey. The rail is
 * always dark, so these are the shades that read on dark; the phone's tab
 * bar uses `TAB_TINT` for its light and dark pages.
 */
const RAIL_TINT: Record<NavIcon, string> = {
  overview: "text-sky-400",
  transfer: "text-amber-400",
  offers: "text-violet-400",
  messages: "text-blue-400",
  listings: "text-emerald-400",
  new: "text-amber-300",
  money: "text-green-400",
  bell: "text-orange-400",
  settings: "text-teal-400",
  review: "text-cyan-400",
  staff: "text-indigo-400",
  people: "text-pink-400",
  support: "text-lime-400",
  dispute: "text-red-400",
};

const TAB_TINT: Partial<Record<NavIcon, string>> = {
  overview: "text-sky-600 dark:text-sky-400",
  transfer: "text-amber-600 dark:text-amber-400",
  messages: "text-blue-600 dark:text-blue-400",
  money: "text-green-600 dark:text-green-400",
};

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

/** The member and staff inboxes, which lay out three panes across the page. */
function isInbox(pathname: string) {
  return /^\/(dashboard|admin)\/messages(\/|$)/.test(pathname);
}

function isActive(pathname: string, item: NavItem) {
  if (item.section) {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  return pathname === item.href;
}

/**
 * One count, in the one place it is allowed to appear: "this many things
 * will not move until you do something". Tinted gold, not filled — it has to
 * be findable from the corner of the eye without shouting over the label.
 */
function WaitingCount({ count }: { count: number }) {
  return (
    <span className="ml-auto inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-primary-soft px-1.5 text-[0.6875rem] leading-none font-semibold text-primary-text tabular-nums ring-1 ring-primary/25 ring-inset">
      {count > 99 ? "99+" : count}
      <span className="sr-only"> waiting on you</span>
    </span>
  );
}

/**
 * The icon, swapped for a spinner while the page it opens is loading. Every
 * dashboard page is rendered on request, so without this a click on a slow
 * page looks like a click that did nothing.
 */
function NavIconSlot({
  icon: Icon,
  tint,
  active,
}: {
  icon: (typeof ICONS)[NavIcon];
  tint: string;
  active: boolean;
}) {
  const { pending } = useLinkStatus();
  return (
    <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
      <Icon
        aria-hidden="true"
        className={cn(
          "size-4 transition-[opacity,color] duration-150",
          tint,
          active ? "opacity-100" : "opacity-75 group-hover:opacity-100",
          pending && "opacity-0",
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-0.5 animate-spin rounded-full border-[1.5px] border-current border-r-transparent text-muted transition-opacity duration-150",
          pending ? "opacity-100" : "opacity-0",
        )}
      />
    </span>
  );
}

/**
 * How the rail's contents move when it folds.
 *
 * Only the rail's width animates; everything inside it stays mounted and
 * stays put. Icons sit at the same 22px from the edge in both widths, which
 * is the centre of the 60px rail, so they never jump sideways. Words fade
 * out quickly as the rail starts to close, and fade back in a beat after it
 * starts to open, so the reader never sees a half-clipped label sliding
 * past. Swapping elements in and out on the toggle is what made the old
 * rail feel like it snapped rather than moved.
 */
const RAIL_MOTION = "duration-300 ease-in-out";
const fadeWith = (collapsed: boolean) =>
  cn(
    "transition-opacity",
    collapsed ? "opacity-0 duration-100" : "opacity-100 duration-200 delay-100",
  );

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const waiting = item.waiting && item.waiting > 0 ? item.waiting : 0;
  // Radix only reports a change that differs from the `open` it was given,
  // so a hover on the open rail used to set this and never clear it — and
  // folding the rail then popped every tooltip touched on the way. Requests
  // made while open are ignored, and every fold or unfold starts it shut
  // (state adjusted during render, React's pattern for following a prop).
  const [tip, setTip] = useState(false);
  const [tipFor, setTipFor] = useState(collapsed);
  if (tipFor !== collapsed) {
    setTipFor(collapsed);
    setTip(false);
  }
  const tipOpen = collapsed && tip;

  // The tooltip is always in the tree, and simply kept shut while the rail
  // is open. Mounting it only when collapsed swapped the link for a new
  // element on every toggle, which threw away the fade in the middle of it.
  return (
    <Tooltip.Root
      open={tipOpen}
      onOpenChange={(open) => setTip(open && collapsed)}
    >
      <Tooltip.Trigger asChild>
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group relative flex h-11 items-center gap-2.5 rounded-md px-3 text-sm transition-[background-color,color,box-shadow] duration-150 pointer-fine:h-8",
            active
              ? "bg-surface font-medium text-fg shadow-xs ring-1 ring-line dark:bg-surface-2"
              : "text-muted hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.05]",
          )}
        >
          <NavIconSlot
            icon={ICONS[item.icon]}
            tint={RAIL_TINT[item.icon]}
            active={active}
          />
          {/* Still the link's name when folded: faded, not removed. */}
          <span
            className={cn(
              "min-w-0 flex-1 overflow-hidden whitespace-nowrap",
              !collapsed && "text-ellipsis",
              fadeWith(collapsed),
            )}
          >
            {item.label}
          </span>
          {waiting ? (
            <>
              <span className={fadeWith(collapsed)}>
                <WaitingCount count={waiting} />
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-1.5 left-[1.625rem] size-1.5 rounded-full bg-primary ring-2 ring-bg transition-[opacity,scale] duration-200",
                  collapsed ? "scale-100 opacity-100" : "scale-50 opacity-0",
                )}
              />
            </>
          ) : null}
        </Link>
      </Tooltip.Trigger>
      {collapsed ? (
        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
            sideOffset={10}
            className="z-50 flex items-center gap-2 rounded-md bg-fg px-2 py-1 text-xs font-medium text-bg shadow-lift data-[state=closed]:animate-pop-out data-[state=delayed-open]:animate-pop-in"
          >
            {item.label}
            {waiting ? (
              <span className="rounded-full bg-primary px-1.5 text-[0.625rem] font-semibold text-primary-fg tabular-nums">
                {waiting}
              </span>
            ) : null}
          </Tooltip.Content>
        </Tooltip.Portal>
      ) : null}
    </Tooltip.Root>
  );
}

function NavList({
  groups,
  currentHref,
  collapsed,
  onNavigate,
}: {
  groups: NavGroup[];
  /** The one item that is lit — the most specific match, never two. */
  currentHref: string | undefined;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Dashboard" className="flex flex-col gap-4">
      {groups.map((group, index) => (
        <div
          key={group.label ?? `group-${index}`}
          className="flex flex-col gap-px"
        >
          {/* One slot of one height for both the heading and the rule that
              stands in for it, so folding the rail moves nothing up or down. */}
          {group.label ? (
            <div className="relative h-6 shrink-0">
              <p
                className={cn(
                  "absolute inset-x-0 bottom-1 overflow-hidden px-3 text-xs leading-4 font-medium whitespace-nowrap text-subtle",
                  fadeWith(collapsed),
                )}
              >
                {group.label}
              </p>
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-1/2 left-3 h-px w-4 bg-line-strong/70 transition-opacity duration-200",
                  collapsed ? "opacity-100 delay-100" : "opacity-0",
                )}
              />
            </div>
          ) : null}
          {group.items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={item.href === currentHref}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

function Wordmark({
  collapsed,
  href,
  staff,
}: {
  collapsed: boolean;
  href: string;
  staff?: boolean;
}) {
  return (
    // The mark sits 16px from the edge either way, which is also the middle
    // of the folded rail — so it holds still while the name fades.
    <Link
      href={href}
      className="flex h-11 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-md px-1 pointer-fine:h-9"
      aria-label={staff ? "Channel Adda staff area" : "Channel Adda dashboard"}
    >
      <ChannelAddaLogo className="size-7 shrink-0" />
      <span
        className={cn(
          "flex min-w-0 items-center gap-2 whitespace-nowrap",
          fadeWith(collapsed),
        )}
      >
        <span className="truncate text-[0.9375rem] font-semibold tracking-[-0.01em] text-fg">
          Channel Adda
        </span>
        {/* The staff and member areas are never allowed to look like each
            other — but a word is enough to tell them apart. */}
        {staff ? (
          <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-md border border-line bg-surface px-1.5 text-[0.6875rem] font-medium text-muted shadow-xs">
            <ShieldCheckIcon aria-hidden="true" className="size-3" />
            Staff
          </span>
        ) : null}
      </span>
    </Link>
  );
}

const iconButton =
  "inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-black/[0.05] hover:text-fg dark:hover:bg-white/[0.06] pointer-fine:size-8";

/**
 * The application shell.
 *
 * Deliberately not the marketing chrome. A quiet rail on the left, a thin bar
 * that says where you are, and everything else given to the page. The rail
 * collapses to icons (remembered, and ⌘/Ctrl+B), and on a phone it lives
 * behind the button in the corner.
 */
/** An open conversation, whose message box needs the bottom of the screen. */
function isThread(pathname: string) {
  return /^\/dashboard\/messages\/[^/]+/.test(pathname);
}

/**
 * The phone's tab bar: the four places a member goes most, and "More" for
 * the rest of the menu.
 *
 * The owner's members are mostly on phones and many are not technical; a
 * menu behind an icon in the top corner was the only way around. A bar at
 * the bottom, where the thumb already is, is the pattern every app they use
 * has taught them. It steps aside inside an open chat, as messaging apps do,
 * so the message box keeps the bottom of the screen.
 */
function TabBar({
  tabs,
  pathname,
  moreWaiting,
}: {
  tabs: NavItem[];
  pathname: string;
  moreWaiting: number;
}) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md backdrop-saturate-150 lg:hidden"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {tabs.map((item) => {
          const Icon = ICONS[item.icon];
          const active =
            item.href === "/dashboard"
              ? pathname === item.href
              : isActive(pathname, { ...item, section: true });
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-15 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors duration-150",
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
                  <Icon
                    aria-hidden="true"
                    className={cn("size-5", active && TAB_TINT[item.icon])}
                  />
                  {item.waiting ? <TabBadge count={item.waiting} /> : null}
                </span>
                {item.label}
                {item.waiting ? (
                  <span className="sr-only">
                    , {item.waiting} waiting on you
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
        <li>
          <SheetTrigger asChild>
            <button
              type="button"
              className="relative flex h-15 w-full cursor-pointer flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium text-subtle transition-colors duration-150 active:text-fg"
            >
              <span className="relative">
                <MenuIcon aria-hidden="true" className="size-5" />
                {moreWaiting ? <TabBadge count={moreWaiting} /> : null}
              </span>
              More
              {moreWaiting ? (
                <span className="sr-only">, {moreWaiting} waiting on you</span>
              ) : null}
            </button>
          </SheetTrigger>
        </li>
      </ul>
    </nav>
  );
}

/** A count on a tab icon: filled gold, so it is seen at a glance. */
function TabBadge({ count }: { count: number }) {
  return (
    <span
      aria-hidden="true"
      className="absolute -top-1.5 -right-2.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] leading-none font-bold text-primary-fg tabular-nums ring-2 ring-bg"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

export function AppShell({
  groups,
  tabs,
  staff,
  user,
  bell,
  balanceCents,
  children,
}: {
  groups: NavGroup[];
  /**
   * The phone's bottom tab bar, in order. Left out in the staff area, which
   * keeps its drawer.
   */
  tabs?: NavItem[];
  /** Marks the rail as the staff area so the two are never confused. */
  staff?: boolean;
  /** Who is signed in, for the account menu. */
  user: ShellUser;
  /**
   * The notification bell, rendered by the layout that knows whose it is.
   * Passed in rather than fetched here so this stays a frame.
   */
  bell?: React.ReactNode;
  /** The member's wallet balance, in cents; left out in the staff area. */
  balanceCents?: number;
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
      // Worked out before the try: the React Compiler gives up on a whole
      // component over a conditional inside a try block.
      const stored = next ? "collapsed" : "expanded";
      try {
        localStorage.setItem("ca-sidebar", stored);
      } catch {
        // Not worth failing the interaction over.
      }
      return next;
    });
  }

  // ⌘B / Ctrl+B, the shortcut every editor taught people. Ignored while
  // typing, where it belongs to the field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "b") return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      event.preventDefault();
      if (window.matchMedia("(min-width: 64rem)").matches) toggle();
      else setDrawerOpen((open) => !open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const home = staff ? "/admin" : "/dashboard";

  // The header names where you are, derived from the nav rather than passed
  // down by every page — one source of truth, and it cannot drift.
  const current = groups
    .flatMap((group) => group.items.map((item) => ({ group, item })))
    .filter(({ item }) => isActive(pathname, item))
    .sort((a, b) => b.item.href.length - a.item.href.length)[0];

  // On a phone the rail lives behind a button, so the thing the rail says
  // loudest — how much is waiting on you — has to survive on that button.
  const waiting = groups
    .flatMap((group) => group.items)
    .reduce((total, item) => total + (item.waiting ?? 0), 0);

  const area = staff ? "staff" : "member";
  const page = current?.item.label ?? (staff ? "Staff" : "Your account");

  const showTabs = tabs !== undefined && !isThread(pathname);
  // What "More" holds that is waiting: everything not already on a tab.
  const tabHrefs = new Set(tabs?.map((tab) => tab.href));
  const moreWaiting = groups
    .flatMap((group) => group.items)
    .filter((item) => !tabHrefs.has(item.href))
    .reduce((total, item) => total + (item.waiting ?? 0), 0);

  return (
    <Tooltip.Provider delayDuration={250} skipDelayDuration={150}>
      {/* The sheet wraps the whole frame so its trigger can live in the top
          bar: Radix hands focus back to that trigger when the drawer closes,
          and gives it aria-expanded and aria-controls. */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <div data-app="" className="min-h-dvh bg-bg">
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:inline-flex focus:h-9 focus:items-center focus:rounded-md focus:border focus:border-line focus:bg-surface focus:px-3 focus:text-sm focus:font-medium focus:text-fg focus:shadow-lift"
          >
            Skip to main content
          </a>

          {/* ---- rail, desktop only ---------------------------------------- */}
          {/* Padding is the same open or folded; only the width moves, and
              whatever no longer fits is clipped by the rail itself. */}
          <aside
            // Always the dark theme (the `dark` class re-scopes the colour
            // tokens), on its surface shade: near-black beside a light page,
            // a step lighter than a dark one, so it reads apart from both.
            className={cn(
              "dark fixed inset-y-0 left-0 z-30 hidden flex-col overflow-hidden border-r border-line bg-surface text-fg lg:flex",
              collapsed ? "w-15" : "w-60",
              mounted && cn("transition-[width]", RAIL_MOTION),
            )}
          >
            <div className="flex h-14 shrink-0 items-center px-3">
              <Wordmark collapsed={collapsed} href={home} staff={staff} />
            </div>

            <div className="no-scrollbar flex-1 overflow-x-hidden overflow-y-auto px-2.5 pt-2 pb-4">
              <NavList
                groups={groups}
                currentHref={current?.item.href}
                collapsed={collapsed}
              />
            </div>

            <div className="shrink-0 border-t border-line px-2.5 py-2">
              <UserMenu user={user} area={area} collapsed={collapsed} />
            </div>
          </aside>

          {/* ---- everything to the right of the rail ------------------------ */}
          <div
            className={cn(
              collapsed ? "lg:pl-15" : "lg:pl-60",
              mounted && cn("transition-[padding]", RAIL_MOTION),
            )}
          >
            <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-bg/80 px-3 backdrop-blur-md backdrop-saturate-150 sm:px-5 lg:px-6">
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label={
                    waiting > 0
                      ? `Open the menu — ${waiting} waiting on you`
                      : "Open the menu"
                  }
                  // With the tab bar, "More" opens the menu; a second
                  // button up here only competed with the page title.
                  className={cn(
                    iconButton,
                    "relative lg:hidden",
                    tabs !== undefined && "hidden",
                  )}
                >
                  <PanelLeftIcon
                    aria-hidden="true"
                    className="size-[1.125rem]"
                  />
                  {waiting > 0 ? (
                    <span
                      aria-hidden="true"
                      className="absolute top-2 right-2 size-1.5 rounded-full bg-primary ring-2 ring-bg pointer-fine:top-1 pointer-fine:right-1"
                    />
                  ) : null}
                </button>
              </SheetTrigger>
              <button
                type="button"
                onClick={toggle}
                aria-label={
                  collapsed ? "Expand the sidebar" : "Collapse the sidebar"
                }
                aria-expanded={!collapsed}
                title={
                  collapsed
                    ? "Expand the sidebar (Ctrl+B)"
                    : "Collapse the sidebar (Ctrl+B)"
                }
                className={cn(iconButton, "-ml-1 hidden lg:inline-flex")}
              >
                <PanelLeftIcon aria-hidden="true" className="size-4" />
              </button>

              <span
                aria-hidden="true"
                className="mx-1 hidden h-4 w-px bg-line-strong/70 sm:block"
              />

              <nav
                aria-label="You are here"
                className="flex min-w-0 flex-1 items-center gap-1.5 text-sm"
              >
                {current?.group.label ? (
                  <>
                    <span className="hidden shrink-0 text-muted sm:inline">
                      {current.group.label}
                    </span>
                    <ChevronRightIcon
                      aria-hidden="true"
                      className="hidden size-3.5 shrink-0 text-subtle/70 sm:block"
                    />
                  </>
                ) : null}
                <span
                  aria-current="page"
                  className="truncate font-medium text-fg"
                >
                  {page}
                </span>
              </nav>

              <div className="flex shrink-0 items-center gap-0.5">
                {balanceCents !== undefined ? (
                  <WalletChip
                    cents={balanceCents}
                    className="hidden rounded-md px-2.5 text-[0.8125rem] hover:bg-black/[0.05] sm:inline-flex dark:hover:bg-white/[0.06] pointer-fine:h-8"
                  />
                ) : null}
                {bell}
                <ThemeToggle
                  className={cn(
                    iconButton,
                    "border-0 hover:border-0 [&_svg]:size-4",
                  )}
                />
                <div className="lg:hidden">
                  <UserMenu user={user} area={area} variant="compact" />
                </div>
              </div>
            </header>

            <main
              id="main"
              className={cn(
                "px-4 pt-6 sm:px-6 lg:px-10 lg:pt-8 lg:pb-20",
                // Room for the tab bar and the phone's home indicator — or,
                // in an open chat, for the message box pinned in its place.
                showTabs || isThread(pathname) ? "pb-28" : "pb-16",
              )}
            >
              {/* The inbox is an app view — threads, the conversation and
                  the deal side by side — so it takes the width there is.
                  Every other page keeps a reading measure, opening up a
                  little on a big screen instead of floating in a 1152px
                  column with a third of the window empty around it. */}
              <div
                className={cn(
                  "mx-auto w-full",
                  isInbox(pathname)
                    ? "max-w-[112rem]"
                    : "max-w-6xl 2xl:max-w-7xl",
                )}
              >
                {children}
              </div>
            </main>
          </div>

          {showTabs && tabs ? (
            <TabBar tabs={tabs} pathname={pathname} moreWaiting={moreWaiting} />
          ) : null}

          {/* ---- the same rail, on a phone ----------------------------------- */}
          <SheetContent
            side="left"
            className="dark w-[17rem] max-w-[85vw] bg-surface p-0 text-fg"
          >
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <SheetDescription className="sr-only">
              Move between the parts of your account.
            </SheetDescription>
            <div className="flex h-14 shrink-0 items-center px-3 pr-12">
              <Wordmark collapsed={false} href={home} staff={staff} />
            </div>
            <div className="flex-1 overflow-y-auto px-3 pt-2 pb-4">
              <NavList
                groups={groups}
                currentHref={current?.item.href}
                collapsed={false}
                onNavigate={() => setDrawerOpen(false)}
              />
            </div>
            <div className="shrink-0 border-t border-line p-2">
              <UserMenu user={user} area={area} />
            </div>
          </SheetContent>
        </div>
      </Sheet>
    </Tooltip.Provider>
  );
}
