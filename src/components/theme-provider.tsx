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
      // next-themes renders its no-flash script from inside this client
      // component. The server's copy is the one that runs, before the first
      // paint. A copy the browser creates later — when an error re-renders
      // the root, say — never runs, and React 19 logs "Encountered a script
      // tag" for it; as a data block it is exempt. 0.4.6 is the latest
      // release and has no fix of its own.
      scriptProps={{
        type: typeof window === "undefined" ? undefined : "text/plain",
      }}
    >
      <CurrencyProvider>{children}</CurrencyProvider>
    </NextThemesProvider>
  );
}
