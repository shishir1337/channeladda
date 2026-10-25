"use client";

import { MenuIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AccountMenu,
  MobileAccountLinks,
} from "@/components/auth/account-menu";
import { ChannelAddaLogo } from "@/components/icons/brand-icons";
import { CurrencySwitcher } from "@/components/site/currency-switcher";
import { useSiteMenu } from "@/components/site/site-menu";
import { ThemeRow, ThemeToggle } from "@/components/site/theme-toggle";
import { HeaderWallet } from "@/components/site/wallet-balance";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { platforms } from "@/data/platforms";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/**
 * Links shown `from` a width: signed in, the balance and the account name
 * leave too little room for all five, and the bar ran off the screen. FAQ is
 * for visitors alone: signed in, the bar never has room for it, however wide
 * the screen. The footer has every one of them at every width.
 */
const navLinks: {
  label: string;
  href: string;
  from?: "xl" | "2xl";
  visitorsOnly?: boolean;
}[] = [
  { label: "Browse accounts", href: "/browse" },
  { label: "How it works", href: "/how-it-works", from: "xl" },
  { label: "Trust & safety", href: "/trust-safety", from: "xl" },
  { label: "Services", href: "/services", from: "xl" },
  { label: "FAQ", href: "/#faq", from: "2xl", visitorsOnly: true },
];

const SHOWN_FROM = { xl: "hidden xl:block", "2xl": "hidden 2xl:block" };

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  // Shared with "More" on the phone's tab bar, which opens this same menu.
  const { open: menuOpen, setOpen: setMenuOpen, returnFocus } = useSiteMenu();
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-[background-color,border-color] duration-200",
        scrolled
          ? "border-b border-line bg-bg/80 backdrop-blur-xl"
          : "border-b border-transparent bg-bg",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-[81rem] items-center gap-3 px-4 sm:px-6 lg:gap-4 lg:px-8 2xl:gap-6">
        <Link
          href="/"
          className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg"
          aria-label="Channel Adda home"
        >
          <ChannelAddaLogo className="size-8" />
          {/* Signed in on the narrowest phones, the mark alone: the balance
              needs the room. */}
          <span
            className={cn(
              "text-[1.0625rem] font-semibold tracking-[-0.02em]",
              signedIn && "max-[22.5rem]:sr-only",
            )}
          >
            Channel <span className="text-primary-text">Adda</span>
          </span>
        </Link>

        <nav aria-label="Main" className="ml-2 hidden lg:block">
          <ul className="flex items-center gap-1">
            {navLinks
              .filter((link) => !(link.visitorsOnly && signedIn))
              .map((link) => (
                <li
                  key={link.href}
                  className={link.from ? SHOWN_FROM[link.from] : undefined}
                >
                  <Link
                    href={link.href}
                    className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Left out on a phone once signed in: the balance takes its place, and
              Browse on the tab bar below goes to the same page. */}
          <Link
            href="/browse"
            aria-label="Search accounts"
            className={cn(
              "inline-flex size-11 cursor-pointer items-center justify-center rounded-[10px] text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg lg:hidden",
              signedIn && "max-sm:hidden",
            )}
          >
            <SearchIcon aria-hidden="true" className="size-[1.15rem]" />
          </Link>
          {/* Each control joins the bar once there is room for it, and is in
              the menu until then: the currency and the theme are chosen once
              in a while, and the bar has room first for what is used every
              visit. Signed in with a large balance, all of them at once ran
              the bar off the screen below 1024px. */}
          <CurrencySwitcher className="hidden lg:inline-flex" />
          <ThemeToggle className="hidden md:inline-flex" />
          <HeaderWallet className="px-2 sm:px-3" />
          <AccountMenu className="hidden sm:inline-flex" />
          <Button asChild size="sm" className="hidden md:inline-flex">
            <Link href="/sell">Sell an account</Link>
          </Button>

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open menu"
                className="inline-flex size-11 cursor-pointer items-center justify-center rounded-[10px] text-fg transition-colors duration-150 hover:bg-surface-2 lg:hidden"
              >
                <MenuIcon aria-hidden="true" className="size-5" />
              </button>
            </SheetTrigger>
            <SheetContent onCloseAutoFocus={returnFocus}>
              <SheetTitle className="border-b border-line px-6 py-5 text-base font-semibold">
                Menu
              </SheetTitle>
              <SheetDescription className="sr-only">
                Site navigation and account actions
              </SheetDescription>

              <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6">
                <nav aria-label="Mobile">
                  <ul className="flex flex-col gap-1">
                    {navLinks.map((link) => (
                      <li key={link.href}>
                        <SheetClose asChild>
                          <Link
                            href={link.href}
                            className="flex min-h-12 items-center rounded-[10px] px-3 text-[0.9375rem] font-medium text-fg transition-colors hover:bg-surface-2"
                          >
                            {link.label}
                          </Link>
                        </SheetClose>
                      </li>
                    ))}
                  </ul>
                </nav>

                <p className="mt-8 mb-3 px-3 text-[0.8125rem] font-medium text-subtle">
                  Shop by platform
                </p>
                <ul className="grid grid-cols-2 gap-2">
                  {platforms.map((platform) => (
                    <li key={platform.id}>
                      <SheetClose asChild>
                        <Link
                          href={`/browse/${platform.id}`}
                          className="flex min-h-12 items-center gap-2.5 rounded-[10px] border border-line px-3 text-sm font-medium transition-colors hover:bg-surface-2"
                        >
                          <platform.icon
                            className="size-4 shrink-0"
                            style={{ color: platform.tint }}
                          />
                          {platform.name}
                        </Link>
                      </SheetClose>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid gap-2.5 border-t border-line bg-surface px-6 py-5">
                <div className="lg:hidden">
                  <p className="mb-2 text-[0.8125rem] font-medium text-subtle">
                    Currency
                  </p>
                  <CurrencySwitcher fullWidth />
                </div>
                <ThemeRow className="-mx-3 w-auto md:hidden" />
                <Button asChild size="md">
                  <Link href="/sell">Sell an account</Link>
                </Button>
                <MobileAccountLinks onNavigate={() => setMenuOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
