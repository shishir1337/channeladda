"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";
import { CurrencyProvider } from "@/lib/currency";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <CurrencyProvider>{children}</CurrencyProvider>
    </NextThemesProvider>
  );
}
