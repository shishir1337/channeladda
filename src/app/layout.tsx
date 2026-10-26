import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { TimeZoneCookie } from "@/components/app/time-zone";
import { AppProviders } from "@/components/theme-provider";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "@/lib/seo";
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
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  applicationName: SITE_NAME,
  // Under 160 characters, the most a search result shows. Every page that
  // has none of its own falls back to this one.
  description: SITE_DESCRIPTION,
  keywords: [
    "buy youtube channel",
    "sell youtube channel",
    "youtube channel buy sell",
    "monetized youtube channel for sale",
    "youtube channel marketplace",
    "buy instagram account",
    "sell instagram account",
    "buy telegram channel",
    "facebook page for sale",
    "Channel Adda",
  ],
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
  },
  // Search Console and Bing Webmaster Tools each ask for a tag to prove the
  // site is ours. Set at deploy, so a new code needs no commit: a DNS record
  // in Cloudflare does the same job for Google and is the better way.
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION
      ? { google: process.env.GOOGLE_SITE_VERIFICATION }
      : {}),
    ...(process.env.BING_SITE_VERIFICATION
      ? { other: { "msvalidate.01": process.env.BING_SITE_VERIFICATION } }
      : {}),
  },
  twitter: { card: "summary_large_image" },
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
        {/* The reader's time zone, for the signed-in pages to draw times in. */}
        <TimeZoneCookie />
      </body>
    </html>
  );
}
