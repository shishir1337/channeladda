import { MailIcon, MessagesSquareIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import {
  ChannelAddaLogo,
  CryptomusIcon,
  FacebookIcon,
  InstagramIcon,
  TelegramIcon,
  YouTubeIcon,
} from "@/components/icons/brand-icons";
import { Container } from "@/components/ui/section";
import { footerNav } from "@/data/site";

const socials = [
  { label: "Channel Adda on Telegram", icon: TelegramIcon },
  { label: "Channel Adda on YouTube", icon: YouTubeIcon },
  { label: "Channel Adda on Instagram", icon: InstagramIcon },
  { label: "Channel Adda on Facebook", icon: FacebookIcon },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-bg-subtle">
      <Container className="py-12 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-16">
          <div>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center gap-2.5 rounded-lg"
              aria-label="Channel Adda home"
            >
              <ChannelAddaLogo className="size-9" />
              <span className="font-display text-xl font-bold tracking-tight">
                Channel <span className="text-primary-text">Adda</span>
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              The escrow-protected marketplace for social media accounts,
              channels and content websites.
            </p>

            <div className="mt-6 inline-flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-2.5">
              <CryptomusIcon aria-hidden="true" className="size-5 text-muted" />
              <span className="text-xs text-muted">
                Payments secured by{" "}
                <span className="font-medium text-fg">Cryptomus</span>
              </span>
            </div>

            <ul className="mt-6 flex items-center gap-2">
              {socials.map((social) => (
                <li key={social.label}>
                  <Link
                    href="/browse"
                    aria-label={social.label}
                    className="inline-flex size-11 items-center justify-center rounded-xl border border-line text-muted transition-colors duration-200 hover:border-line-strong hover:bg-surface hover:text-fg"
                  >
                    <social.icon
                      aria-hidden="true"
                      className="size-[1.05rem]"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <nav aria-label="Footer">
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 sm:gap-6">
              {footerNav.map((group) => (
                <div key={group.title}>
                  <h2 className="font-display text-sm font-semibold">
                    {group.title}
                  </h2>
                  <ul className="mt-4 flex flex-col gap-3">
                    {group.links.map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          className="inline-flex min-h-9 items-center text-sm text-muted transition-colors duration-200 hover:text-fg"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </nav>
        </div>

        <div className="mt-12 grid gap-4 rounded-card border border-line bg-surface p-5 sm:grid-cols-2 sm:p-6">
          <div className="flex items-start gap-3">
            <MessagesSquareIcon
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-primary-text"
            />
            <div>
              <h2 className="text-sm font-semibold">Support, 24/7</h2>
              <p className="mt-1 text-sm text-muted">
                Live chat replies in under 10 minutes, every day of the year.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <MailIcon
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-primary-text"
            />
            <div>
              <h2 className="text-sm font-semibold">Disputes & escalations</h2>
              <p className="mt-1 text-sm text-muted">
                disputes@channeladda.com — reviewed by a moderator within 24
                hours.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-5 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-subtle">
            © {new Date().getFullYear()} Channel Adda. All rights reserved.
          </p>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {[
              { label: "Terms of service", href: "/terms" },
              { label: "Privacy policy", href: "/privacy" },
              { label: "Refund policy", href: "/refunds" },
              { label: "AML & KYC", href: "/aml-kyc" },
            ].map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-9 items-center text-xs text-subtle transition-colors duration-200 hover:text-fg"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-8 flex items-start gap-2.5 text-xs leading-relaxed text-subtle">
          <ShieldCheckIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-verified"
          />
          <span>
            Channel Adda is an independent marketplace and is not affiliated
            with, endorsed by, or sponsored by YouTube, Google, Meta or
            Telegram. All trademarks belong to their respective owners. Sellers
            are responsible for complying with each platform&apos;s terms of
            service when transferring an account.
          </span>
        </p>
      </Container>
    </footer>
  );
}
