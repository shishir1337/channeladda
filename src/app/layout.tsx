import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AppProviders } from "@/components/theme-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  // Resolves relative OG image paths. Swap for the real domain at deploy.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "Channel Adda — Buy & sell social media accounts, safely",
    template: "%s | Channel Adda",
  },
  description:
    "The supervised marketplace for YouTube channels, Instagram, Facebook and Telegram accounts and content websites. Ownership-checked listings, crypto payments via Cryptomus, and a Channel Adda agent holding either the account or the money until the handover is confirmed.",
  keywords: [
    "buy youtube channel",
    "sell instagram account",
    "social media marketplace",
    "monetized channel for sale",
    "telegram channel marketplace",
    "supervised account transfer",
  ],
  openGraph: {
    title: "Channel Adda — Buy & sell social media accounts, safely",
    description:
      "Ownership-checked listings, crypto payments, and an agent holding one side of every deal until the handover is confirmed.",
    siteName: "Channel Adda",
    type: "website",
  },
  other: {
    // Payment-processor domain verification. Both tags must be served on every
    // page, so they live on the root layout rather than a single route — the
    // processor re-checks them, and removing one later can deactivate the
    // merchant account. The two names are the same provider before and after
    // its rebrand, so keep both until Cryptomus is confirmed retired.
    cryptomus: "012ee0cb",
    heleket: "f583cfad",
  },
};

export const viewport: Viewport = {
  // Zoom stays enabled — never trap users at initial scale.
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfd" },
    { media: "(prefers-color-scheme: dark)", color: "#07090f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      {/* Browser extensions write attributes onto <body> before React loads
          (ColorZilla adds cz-shortcut-listen, Grammarly its own). Only this
          element's attributes are excused — a mismatch inside it still shows. */}
      <body
        suppressHydrationWarning
        className="flex min-h-full flex-col bg-bg text-fg"
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
