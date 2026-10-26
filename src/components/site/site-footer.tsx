import Link from "next/link";
import { ChannelAddaLogo } from "@/components/icons/brand-icons";
import { Container } from "@/components/ui/section";
import { footerLinks, legalLinks } from "@/data/site";
import { CONTACT_EMAIL } from "@/lib/seo";

const linkClass =
  "inline-flex min-h-9 items-center text-muted transition-colors duration-150 hover:text-fg";

/**
 * Short, on purpose: the logo and one row of links, then a line for the
 * small print. It used to be four columns of links, a support box, the
 * platforms and a payments badge, a phone's full screen and more (the owner,
 * 2026-10-27: "too much big, make it short minimal clean").
 *
 * The Cryptomus verification line went on 2026-10-26; the domain is still
 * verified by the `cryptomus` and `heleket` meta tags on the root layout.
 */
export function SiteFooter() {
  return (
    // The last thing on every page, so it keeps the room for the phone's
    // tab bar (60px and the home indicator) — and on a listing, whose buy
    // bar sits on top of the tab bar, for that bar too.
    <footer className="border-t border-line bg-bg-subtle max-lg:pb-[calc(3.75rem+env(safe-area-inset-bottom))] max-lg:[body:has([data-buy-bar])_&]:pb-[calc(8.25rem+env(safe-area-inset-bottom))]">
      <Container className="py-8 sm:py-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <Link
            href="/"
            className="inline-flex min-h-11 w-fit shrink-0 items-center gap-2.5 rounded-lg"
            aria-label="Channel Adda home"
          >
            <ChannelAddaLogo className="size-7" />
            <span className="text-base font-semibold tracking-[-0.02em]">
              Channel <span className="text-primary-text">Adda</span>
            </span>
          </Link>

          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-5 text-sm lg:justify-end">
              {footerLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={linkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-5 flex flex-col gap-x-8 gap-y-1 border-t border-line pt-5 text-[0.8125rem] text-subtle lg:flex-row lg:items-center lg:justify-between">
          <p className="flex flex-wrap items-center gap-x-2">
            <span>© {new Date().getFullYear()} Channel Adda</span>
            <span aria-hidden="true">·</span>
            <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>
              {CONTACT_EMAIL}
            </a>
          </p>
          <ul className="flex flex-wrap gap-x-5">
            {legalLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={linkClass}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-2 flex flex-col gap-x-8 gap-y-2 text-xs leading-relaxed text-subtle lg:flex-row lg:justify-between">
          <p>
            Independent. Not affiliated with YouTube, Google, Meta or Telegram.
          </p>
          <p className="shrink-0">
            Designed &amp; built by{" "}
            <a
              href="https://arrowbin.com/"
              target="_blank"
              rel="noopener"
              className="font-medium text-muted underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:text-fg hover:decoration-fg"
            >
              Arrowbin
            </a>
          </p>
        </div>
      </Container>
    </footer>
  );
}
