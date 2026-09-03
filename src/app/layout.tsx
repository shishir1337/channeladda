import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { AppProviders } from "@/components/theme-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
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
    default:
      "Channel Adda — Buy & sell social media accounts with escrow protection",
    template: "%s | Channel Adda",
  },
  description:
    "The escrow-protected marketplace for YouTube channels, Instagram, Facebook and Telegram accounts and content websites. KYC-verified sellers, crypto payments via Cryptomus, and funds released only after a confirmed handover.",
  keywords: [
    "buy youtube channel",
    "sell instagram account",
    "social media marketplace",
    "monetized channel for sale",
    "telegram channel marketplace",
    "escrow account transfer",
  ],
  openGraph: {
    title:
      "Channel Adda — Buy & sell social media accounts with escrow protection",
    description:
      "Escrow-held crypto payments, KYC-verified sellers, and a supervised handover on every deal.",
    siteName: "Channel Adda",
    type: "website",
  },
  other: {
    // Proves to Cryptomus that we control this domain. It must be served on
    // the apex of every page, so it lives on the root layout rather than a
    // single route — Cryptomus re-checks it, and removing it later can
    // deactivate the merchant account.
    cryptomus: "46c80815",
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
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-bg text-fg">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
