"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // The resolved theme is unknown on the server, so render a stable
  // placeholder until hydration to avoid a mismatched icon.
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={
        mounted
          ? `Switch to ${isDark ? "light" : "dark"} theme`
          : "Switch colour theme"
      }
      className={cn(
        "inline-flex size-11 cursor-pointer items-center justify-center rounded-[10px] text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg",
        className,
      )}
    >
      {mounted && !isDark ? (
        <MoonIcon aria-hidden="true" className="size-[1.15rem]" />
      ) : (
        <SunIcon aria-hidden="true" className="size-[1.15rem]" />
      )}
    </button>
  );
}

/** Light or dark, once mounted; null before, when the server cannot know. */
function useDark() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted ? resolvedTheme === "dark" : null;
  return { dark, flip: () => setTheme(dark ? "light" : "dark") };
}

/**
 * The theme as a row with a switch, for the foot of a phone's menu: choosing
 * a theme is a once-in-a-while thing and has no business in the header.
 */
export function ThemeRow({ className }: { className?: string }) {
  const { dark, flip } = useDark();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark === true}
      onClick={flip}
      className={cn(
        "flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-md px-3 text-sm text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg",
        className,
      )}
    >
      <MoonIcon aria-hidden="true" className="size-4 shrink-0" />
      <span className="flex-1 text-left">Dark mode</span>
      <span
        aria-hidden="true"
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
          dark ? "bg-primary" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-xs transition-transform duration-200",
            dark && "translate-x-4",
          )}
        />
      </span>
    </button>
  );
}

/** The same switch as an item in an account dropdown. */
export function ThemeMenuItem({ className }: { className?: string }) {
  const { dark, flip } = useDark();
  return (
    <DropdownMenu.Item
      className={className}
      onSelect={(event) => {
        // Stays open, so the change is seen with the menu still there.
        event.preventDefault();
        flip();
      }}
    >
      {dark ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
      {dark ? "Light mode" : "Dark mode"}
    </DropdownMenu.Item>
  );
}
