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
import { iconText } from "@/components/ui/icon-hue";
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
    // The last thing on every page, so it keeps the room for the phone's
    // tab bar (60px and the home indicator) — and on a listing, whose buy
    // bar sits on top of the tab bar, for that bar too.
    <footer className="border-t border-line bg-bg-subtle max-lg:pb-[calc(3.75rem+env(safe-area-inset-bottom))] max-lg:[body:has([data-buy-bar])_&]:pb-[calc(8.25rem+env(safe-area-inset-bottom))]">
      <Container className="py-12 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-16">
          <div>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center gap-2.5 rounded-lg"
              aria-label="Channel Adda home"
            >
              <ChannelAddaLogo className="size-8" />
              <span className="text-[1.0625rem] font-semibold tracking-[-0.02em]">
                Channel <span className="text-primary-text">Adda</span>
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              The supervised marketplace for social media accounts, channels and
              content websites.
            </p>

            <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
              <CryptomusIcon aria-hidden="true" className="size-4 text-muted" />
              <span className="text-[0.8125rem] text-muted">
                Payments secured by{" "}
                <span className="font-medium text-fg">Cryptomus</span>
              </span>
            </div>

            {/* The icons used to be links to /browse, labelled “Channel Adda
                on Telegram” and so on, so clicking one reloaded the
                marketplace. Until there are real accounts to point at, they
                say which platforms we trade rather than pretending to be
                somewhere we are not. */}
            <ul
              aria-label="Platforms we trade"
              className="mt-6 flex items-center gap-2"
            >
              {socials.map((social) => (
                <li
                  key={social.label}
                  className="inline-flex size-9 items-center justify-center rounded-lg border border-line text-subtle"
                >
                  <social.icon aria-hidden="true" className="size-4" />
                  <span className="sr-only">{social.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <nav aria-label="Footer">
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 sm:gap-6">
              {footerNav.map((group) => (
                <div key={group.title}>
                  <h2 className="text-sm font-semibold text-fg">
                    {group.title}
                  </h2>
                  <ul className="mt-3 flex flex-col gap-1">
                    {group.links.map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          className="inline-flex min-h-9 items-center text-sm text-muted transition-colors duration-150 hover:text-fg"
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

        <div className="mt-12 grid gap-4 rounded-card border border-line bg-surface p-5 sm:grid-cols-2">
          <Link href="/support" className="group flex items-start gap-3">
            <MessagesSquareIcon
              aria-hidden="true"
              className={`mt-0.5 size-4.5 shrink-0 ${iconText(MessagesSquareIcon)}`}
            />
            <div>
              <h2 className="text-sm font-semibold text-fg group-hover:underline group-hover:underline-offset-4">
                Support
              </h2>
              <p className="mt-1 text-sm text-muted">
                Write to us from the support page and a person replies.
              </p>
            </div>
          </Link>
          <div className="flex items-start gap-3">
            <MailIcon
              aria-hidden="true"
              className={`mt-0.5 size-4.5 shrink-0 ${iconText(MailIcon)}`}
            />
            <div>
              <h2 className="text-sm font-semibold text-fg">
                Disputes & escalations
              </h2>
              <p className="mt-1 text-sm text-muted">
                Open one from the deal page, or write to
                disputes@channeladda.com. Reviewed by a moderator within 24
                hours.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-5 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[0.8125rem] text-subtle">
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
                  className="inline-flex min-h-9 items-center text-[0.8125rem] text-subtle transition-colors duration-150 hover:text-fg"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/*
          Cryptomus domain-ownership verification token. Their checker fetches
          the homepage and looks for this exact string, so it has to be real
          rendered text — `sr-only`, `hidden` and comment-only markup all get
          rejected as an attempt to hide it. Small and unobtrusive is fine;
          invisible is not. Do not remove without confirming with Cryptomus
          first: losing it can deactivate the merchant account.
        */}
        <p className="mt-8 font-mono text-[0.6875rem] tracking-wide text-subtle">
          Cryptomus verification: dl-H67v-dBsw
        </p>

        <p className="mt-6 flex items-start gap-2.5 text-xs leading-relaxed text-subtle">
          <ShieldCheckIcon
            aria-hidden="true"
            className={`mt-0.5 size-4 shrink-0 ${iconText(ShieldCheckIcon)}`}
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
