"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

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
      className={`inline-flex size-11 cursor-pointer items-center justify-center rounded-xl border border-line text-muted transition-colors duration-200 hover:border-line-strong hover:bg-surface-2 hover:text-fg ${className ?? ""}`}
    >
      {mounted && !isDark ? (
        <MoonIcon aria-hidden="true" className="size-[1.15rem]" />
      ) : (
        <SunIcon aria-hidden="true" className="size-[1.15rem]" />
      )}
    </button>
  );
}
