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
import { ThemeToggle } from "@/components/site/theme-toggle";
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
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "Browse accounts", href: "/browse" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Trust & safety", href: "/#trust" },
  { label: "Services", href: "/services" },
  { label: "FAQ", href: "/#faq" },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-[background-color,border-color,box-shadow] duration-300",
        scrolled
          ? "border-b border-line bg-bg/85 shadow-soft backdrop-blur-xl"
          : "border-b border-transparent bg-bg",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-[81rem] items-center gap-3 px-4 sm:px-6 lg:h-[4.5rem] lg:gap-6 lg:px-8">
        <Link
          href="/"
          className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg"
          aria-label="Channel Adda home"
        >
          <ChannelAddaLogo className="size-8 lg:size-9" />
          <span className="font-display text-lg font-bold tracking-tight lg:text-xl">
            Channel <span className="text-primary-text">Adda</span>
          </span>
        </Link>

        <nav aria-label="Main" className="ml-2 hidden lg:block">
          <ul className="flex items-center gap-1">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-muted transition-colors duration-200 hover:bg-surface-2 hover:text-fg"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/browse"
            aria-label="Search accounts"
            className="inline-flex size-11 cursor-pointer items-center justify-center rounded-xl border border-line text-muted transition-colors duration-200 hover:border-line-strong hover:bg-surface-2 hover:text-fg lg:hidden"
          >
            <SearchIcon aria-hidden="true" className="size-[1.15rem]" />
          </Link>
          <CurrencySwitcher className="hidden sm:inline-flex" />
          <ThemeToggle />
          <AccountMenu className="hidden sm:inline-flex" />
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/sell">Sell an account</Link>
          </Button>

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open menu"
                className="inline-flex size-11 cursor-pointer items-center justify-center rounded-xl border border-line text-fg transition-colors duration-200 hover:bg-surface-2 lg:hidden"
              >
                <MenuIcon aria-hidden="true" className="size-5" />
              </button>
            </SheetTrigger>
            <SheetContent>
              <SheetTitle className="border-b border-line px-6 py-5 font-display text-lg font-bold">
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
                            className="flex min-h-12 items-center rounded-xl px-3 text-[0.9375rem] font-medium text-fg transition-colors hover:bg-surface-2"
                          >
                            {link.label}
                          </Link>
                        </SheetClose>
                      </li>
                    ))}
                  </ul>
                </nav>

                <p className="mt-8 mb-3 px-3 text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
                  Shop by platform
                </p>
                <ul className="grid grid-cols-2 gap-2">
                  {platforms.map((platform) => (
                    <li key={platform.id}>
                      <SheetClose asChild>
                        <Link
                          href={`/browse/${platform.id}`}
                          className="flex min-h-12 items-center gap-2.5 rounded-xl border border-line px-3 text-sm font-medium transition-colors hover:bg-surface-2"
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
                <div className="sm:hidden">
                  <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
                    Currency
                  </p>
                  <CurrencySwitcher fullWidth />
                </div>
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
